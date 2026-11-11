import * as THREE from 'three';
import { makeTextures, applyDetailMaps } from './textures.js';

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
const clampCycle = (t) => Math.max(0, Math.min(1, t));

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

function roundedRectPath(w, d, r) {
  const p = new THREE.Path();
  const hw = w / 2;
  const hd = d / 2;
  p.moveTo(-hw + r, -hd);
  p.lineTo(hw - r, -hd);
  p.quadraticCurveTo(hw, -hd, hw, -hd + r);
  p.lineTo(hw, hd - r);
  p.quadraticCurveTo(hw, hd, hw - r, hd);
  p.lineTo(-hw + r, hd);
  p.quadraticCurveTo(-hw, hd, -hw, hd - r);
  p.lineTo(-hw, -hd + r);
  p.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  return p;
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

function remapMaterialMaps(material) {
  return material;
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

export function buildCampus(scene, renderer, options = {}) {
  const reducedMotion = Boolean(options.reducedMotion);
  const tex = makeTextures(renderer);
  const materials = buildMaterials(tex, renderer);
  const pickables = [];
  const swayers = [];
  const facadeMaterials = materials.facadeMaterials;
  const lampSprites = [];
  const lampGlowMaterials = [];
  const windowMaterials = [materials.lattice, materials.latticeWindow];
  const walkers = [];

  const campus = new THREE.Group();
  campus.name = 'Hainan Middle School · Fucheng Campus';
  scene.add(campus);

  /* ---------------------------- sky & light --------------------------- */
  const skyUniforms = {
    uZenith: { value: new THREE.Color(0x7c9da2) },
    uHorizon: { value: new THREE.Color(0xf1ddc1) },
    uSunColor: { value: new THREE.Color(0xfff1cf) },
    uSunDir: { value: new THREE.Vector3(0.5, 0.5, 0.4) },
    uSunStrength: { value: 1 },
    uNight: { value: 0 },
    uTime: { value: 0 }
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(430, 40, 26),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: skyUniforms,
      vertexShader: `
        varying vec3 vDirection;
        void main() {
          vDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uSunColor;
        uniform vec3 uSunDir;
        uniform float uSunStrength;
        uniform float uNight;
        varying vec3 vDirection;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        void main() {
          vec3 dir = normalize(vDirection);
          float h = clamp(dir.y, -1.0, 1.0);
          float grad = smoothstep(-0.08, 0.78, h);
          vec3 color = mix(uHorizon, uZenith, pow(grad, 0.84));
          float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
          float halo = pow(sunDot, 5.0) * 0.22;
          float disc = pow(sunDot, 620.0) * 1.7;
          color += uSunColor * (halo + disc) * uSunStrength;
          float horizonWarmth = pow(1.0 - abs(h), 8.0);
          color += vec3(0.12, 0.055, 0.025) * horizonWarmth * (1.0 - uNight) * (0.18 + 0.55 * (1.0 - smoothstep(0.0, 0.72, uSunStrength)));
          gl_FragColor = vec4(color, 1.0);
        }
      `
    })
  );
  sky.renderOrder = -20;
  campus.add(sky);

  const stars = (() => {
    const n = 460;
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      const theta = rand(0, TAU);
      const phi = Math.acos(rand(0.05, 0.98));
      const r = 380;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xf3edd8,
      size: 1.2,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false
    });
    const points = new THREE.Points(geo, mat);
    points.renderOrder = -19;
    campus.add(points);
    return points;
  })();

  const hemi = new THREE.HemisphereLight(0xc4d7d0, 0x5a5842, 1.1);
  campus.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe2b5, 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -88;
  sun.shadow.camera.right = 88;
  sun.shadow.camera.top = 82;
  sun.shadow.camera.bottom = -82;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 290;
  sun.shadow.bias = -0.00028;
  sun.shadow.normalBias = 0.045;
  campus.add(sun);
  campus.add(sun.target);
  const moon = new THREE.DirectionalLight(0x94acab, 0);
  moon.position.set(-35, 90, 55);
  campus.add(moon);
  const fill = new THREE.DirectionalLight(0x9fbac0, 0.22);
  fill.position.set(50, 35, -60);
  campus.add(fill);

  /* ---------------------------- plinth ------------------------------- */
  const world = new THREE.Group();
  campus.add(world);

  const plinthShape = roundedRectShape(140, 114, 11);
  const plinthGeo = new THREE.ExtrudeGeometry(plinthShape, {
    depth: 3.2,
    bevelEnabled: true,
    bevelSize: 0.8,
    bevelThickness: 0.55,
    bevelSegments: 3,
    curveSegments: 20
  });
  plinthGeo.rotateX(Math.PI / 2);
  const plinthTop = new THREE.MeshStandardMaterial({
    map: tex.stone.clone(),
    color: 0xcbbda5,
    roughness: 0.95
  });
  plinthTop.map.repeat.set(12, 9);
  plinthTop.map.needsUpdate = true;
  const plinthSide = new THREE.MeshStandardMaterial({
    color: 0xad9f87,
    roughness: 0.91
  });
  const plinth = new THREE.Mesh(plinthGeo, [plinthTop, plinthSide]);
  // The extruded bevel sits 0.55 units above its nominal top; drop it
  // so the grass, paths and track plane are not hidden by the plinth lid.
  plinth.position.y = -0.56;
  plinth.receiveShadow = true;
  plinth.castShadow = true;
  world.add(plinth);

  // grass blanket
  const grassShape = roundedRectShape(133, 107, 8.5);
  const grassMesh = flatShapeMesh(grassShape, materials.ground, 0.025);
  world.add(grassMesh);

  // stone rim
  const rimOuter = roundedRectShape(136.8, 110.8, 9.2);
  rimOuter.holes.push(roundedRectPath(132.8, 106.8, 8.2));
  const rim = flatShapeMesh(rimOuter, materials.stoneLight, 0.055);
  world.add(rim);

  // a soft floating shadow, independent from the plinth
  const underShadowMat = new THREE.MeshBasicMaterial({
    map: tex.shadow,
    transparent: true,
    opacity: 0.38,
    depthWrite: false
  });
  const underShadow = new THREE.Mesh(new THREE.PlaneGeometry(230, 190), underShadowMat);
  underShadow.rotation.x = -Math.PI / 2;
  underShadow.position.y = -5.1;
  underShadow.renderOrder = 0;
  world.add(underShadow);

  // site plan inlays: long walks and courtyards
  const mainApproach = addPath(world, [[0, 54.2], [0, 45], [0, 35]], 12, materials.path, Y0 + 0.04, 6);
  mainApproach.receiveShadow = true;
  addPath(world, [[0, 35], [0, 20], [0, 14.7]], 8.6, materials.path, Y0 + 0.045, 5);
  addPath(world, [[0, 35], [-15, 29], [-26, 25], [-47, 18]], 4.1, materials.path, Y0 + 0.042, 4);
  addPath(world, [[0, 35], [16, 30], [29, 26], [49, 19]], 4.1, materials.path, Y0 + 0.042, 4);
  addPath(world, [[-14, 21], [-25, 13], [-35, 9.5]], 3.3, materials.path, Y0 + 0.042, 3.6);
  addPath(world, [[16, 21], [26, 12], [34, 7]], 3.3, materials.path, Y0 + 0.042, 3.6);
  addPath(world, [[-6, 4], [-20, -4], [-32, -2.2]], 3.1, materials.path, Y0 + 0.042, 3.6);
  addPath(world, [[8, 3], [22, -4], [30, -8]], 3.1, materials.path, Y0 + 0.042, 3.6);
  addPath(world, [[-52, 38], [-42, 30], [-28, 32], [-20, 24]], 2.5, materials.path, Y0 + 0.041, 3);
  addPath(world, [[-36, 9], [-36, 4.8]], 4.8, materials.path, Y0 + 0.043, 3);
  addPath(world, [[36, 4], [36, -3.2]], 4.5, materials.path, Y0 + 0.043, 3);
  addPath(world, [[0, -2], [0, -17]], 4.5, materials.path, Y0 + 0.041, 3.5);

  // entry plaza
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(12.6, 80), materials.plaza);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, Y0 + 0.055, 31.5);
  plaza.receiveShadow = true;
  world.add(plaza);

  // 凤栖堂 red-brick courtyard
  const fengqiCourt = new THREE.Mesh(new THREE.PlaneGeometry(29.5, 20), materials.courtyard);
  fengqiCourt.rotation.x = -Math.PI / 2;
  fengqiCourt.position.set(-36, Y0 + 0.044, 4);
  fengqiCourt.receiveShadow = true;
  world.add(fengqiCourt);

  // secondary lawn panels make the huge lawn feel inhabited
  const frontLawnMat = materials.lawnDark;
  for (const [x, z, w, d] of [
    [-12.7, 24.5, 8.7, 9.2],
    [12.7, 24.5, 8.7, 9.2],
    [-12.5, 11.2, 8.2, 5.2],
    [12.5, 11.2, 8.2, 5.2],
    [-47, -30, 14, 13],
    [48, -30, 14, 13]
  ]) {
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(w, d), frontLawnMat);
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(x, Y0 + 0.052, z);
    lawn.receiveShadow = true;
    world.add(lawn);
  }

  /* ---------------------------- perimeter wall ----------------------- */
  const wallMat = materials.plaster;
  const wallRoof = materials.roofEdge;
  function wallSegment(x1, z1, x2, z2, gateGap = false) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len < 0.1) return;
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;
    const angle = Math.atan2(dx, dz);
    const base = placeBox(world, 0.52, 1.65, len, wallMat, cx, Y0, cz, angle);
    base.receiveShadow = true;
    const coping = placeBox(world, 0.76, 0.16, len + 0.1, wallRoof, cx, 1.72, cz, angle);
    coping.castShadow = true;
    if (!gateGap) {
      const posts = Math.max(1, Math.round(len / 7.5));
      for (let i = 0; i <= posts; i += 1) {
        const t = i / posts;
        const px = x1 + dx * t;
        const pz = z1 + dz * t;
        placeBox(world, 0.8, 2.15, 0.8, materials.plasterPale, px, Y0, pz, angle);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.45, 4), materials.roofEdge);
        cap.position.set(px, 2.42, pz);
        cap.rotation.y = Math.PI / 4;
        cap.castShadow = true;
        world.add(cap);
      }
    }
  }
  // south wall, leaving the gate opening
  wallSegment(-61, 48, -13.4, 48);
  wallSegment(13.4, 48, 61, 48);
  wallSegment(61, 48, 61, -48);
  wallSegment(61, -48, 14, -48);
  wallSegment(14, -48, -14, -48);
  wallSegment(-61, -48, -14, -48);
  wallSegment(-61, -48, -61, -26);
  wallSegment(-61, -20, -61, 48);
  // small west gate near the historic courtyard
  for (const z of [-26, -20]) {
    placeBox(world, 0.92, 2.65, 0.92, materials.plasterPale, -61, Y0, z);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.5, 4), materials.roofEdge);
    cap.position.set(-61, 2.95, z);
    cap.rotation.y = Math.PI / 4;
    world.add(cap);
  }
  const westLintel = placeBox(world, 0.8, 0.26, 6, materials.roofEdge, -61, 2.43, -23);
  const westGateRoof = createHipRoof({ w: 7.2, d: 2.2, h: 0.6, upturn: 0.22, materials, detail: false });
  westGateRoof.rotation.y = Math.PI / 2;
  westGateRoof.position.set(-61, 2.55, -23);
  world.add(westGateRoof);

  // avenue outside the south gate
  const approachOutside = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), materials.pathDark);
  approachOutside.rotation.x = -Math.PI / 2;
  approachOutside.position.set(0, Y0 + 0.05, 53);
  approachOutside.receiveShadow = true;
  world.add(approachOutside);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i += 1) {
      const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.72, 8), materials.stoneLight);
      bollard.position.set(side * (7.3 + i * 1.15), 0.42, 50.8);
      bollard.castShadow = true;
      world.add(bollard);
    }
  }

  /* ---------------------------- flagpole ----------------------------- */
  const flagGroup = new THREE.Group();
  flagGroup.position.set(-9.8, Y0, 29.5);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 14.6, 8), materials.whiteMetal);
  pole.position.y = 7.3;
  pole.castShadow = true;
  flagGroup.add(pole);
  const poleBase = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.05, 0.35, 20), materials.stoneLight);
  poleBase.position.y = 0.18;
  poleBase.castShadow = true;
  flagGroup.add(poleBase);
  const poleCap = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), materials.gold);
  poleCap.position.y = 14.65;
  flagGroup.add(poleCap);

  const flagGeo = new THREE.PlaneGeometry(4.1, 2.4, 22, 12);
  flagGeo.translate(2.05, -1.2, 0);
  const flagMat = new THREE.MeshStandardMaterial({
    map: tex.flag,
    side: THREE.DoubleSide,
    roughness: 0.88,
    metalness: 0
  });
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.set(0.06, 14.15, 0);
  flag.castShadow = true;
  flagGroup.add(flag);
  const flagBasePositions = Float32Array.from(flagGeo.attributes.position.array);
  world.add(flagGroup);

  // school motto stone near the entrance
  const mottoStone = placeBox(world, 7.8, 2.2, 0.65, materials.stone, 19.6, Y0, 39.6, -0.22);
  const mottoMap = tex.mottoPlaque;
  const mottoMat = materials.signMaterial(mottoMap);
  const mottoFace = plane(7.1, 1.15, mottoMat);
  mottoFace.position.set(19.35, 1.18, 39.98);
  mottoFace.rotation.y = -0.22;
  world.add(mottoFace);
  const mottoCap = placeBox(world, 8.4, 0.12, 0.85, materials.stoneLight, 19.6, 2.26, 39.6, -0.22);

  /* ---------------------------- gate --------------------------------- */
  const gate = new THREE.Group();
  gate.position.set(0, Y0, 48);
  // local +z is the approach side (south)

  const gateBase = placeBox(gate, 27.5, 0.42, 6.2, materials.stone, 0, 0, 0);
  gateBase.receiveShadow = true;
  const gateStep1 = placeBox(gate, 14.8, 0.16, 7.4, materials.stoneLight, 0, 0.02, 0.5);
  const gateStep2 = placeBox(gate, 12.2, 0.14, 8.4, materials.stoneLight, 0, 0.17, 1.2);

  const columnXs = [-11.2, -4.4, 4.4, 11.2];
  for (let i = 0; i < columnXs.length; i += 1) {
    const x = columnXs[i];
    const inner = Math.abs(x) < 5;
    const h = inner ? 7.7 : 6.65;
    const baseBlock = placeBox(gate, 1.3, 0.55, 1.3, materials.stoneLight, x, 0.42, 0);
    const plinthBlock = placeBox(gate, 1.05, 0.55, 1.05, materials.stone, x, 0.94, 0);
    const shaft = placeBox(gate, 0.72, h - 1.5, 0.72, materials.plaster, x, 1.48, 0);
    shaft.castShadow = true;
    placeBox(gate, 0.9, 0.1, 0.9, materials.gold, x, 1.62, 0);
    placeBox(gate, 0.84, 0.12, 0.84, materials.gold, x, 2.42, 0);
    placeBox(gate, 0.96, 0.38, 0.96, materials.plasterWarm, x, 1.42 + (h - 1.5) - 0.1, 0);
    // decorated bracket at the top
    placeBox(gate, 1.35, 0.24, 1.25, materials.gold, x, 1.6 + (h - 1.8), 0);
  }

  // lintels and side beams
  for (const side of [-1, 1]) {
    const outer = side * 11.2;
    const inner = side * 4.4;
    const mid = (outer + inner) / 2;
    placeBox(gate, Math.abs(outer - inner) + 1.1, 0.4, 0.62, materials.darkWood, mid, 5.6, 0);
    placeBox(gate, Math.abs(outer - inner) + 0.9, 0.18, 0.7, materials.gold, mid, 5.98, 0);
    placeBox(gate, Math.abs(outer - inner) + 1.1, 0.24, 0.5, materials.redWood, mid, 4.55, 0.15);
  }
  placeBox(gate, 9.7, 0.38, 0.65, materials.darkWood, 0, 5.72, 0);
  placeBox(gate, 9.4, 0.16, 0.75, materials.gold, 0, 6.06, 0);

  // central plaque
  const gatePlaqueMat = materials.signMaterial(tex.gatePlaque, true);
  const plaqueBack = placeBox(gate, 6.2, 1.48, 0.2, materials.darkWood, 0, 6.18, 0.7);
  const plaqueLip = placeBox(gate, 6.5, 0.12, 0.34, materials.gold, 0, 7.62, 0.72);
  const gatePlaque = plane(5.9, 1.33, gatePlaqueMat);
  gatePlaque.position.set(0, 6.95, 0.82);
  gate.add(gatePlaque);
  const gatePlaqueBack = plane(5.9, 1.33, gatePlaqueMat);
  gatePlaqueBack.position.set(0, 6.95, 0.58);
  gatePlaqueBack.rotation.y = Math.PI;
  gate.add(gatePlaqueBack);

  // roofs
  const gateRoofMain = createHipRoof({ w: 12.2, d: 5.3, h: 1.8, upturn: 0.42, materials, detail: true });
  gateRoofMain.position.y = 8.15;
  gate.add(gateRoofMain);
  for (const side of [-1, 1]) {
    const roof = createHipRoof({ w: 8.6, d: 4.6, h: 1.25, upturn: 0.35, materials, detail: true });
    roof.position.set(side * 8.0, 6.98, 0);
    gate.add(roof);
  }

  // decorative beams under the central roof
  addEaveBrackets(gate, 10.1, 7.58, 0.55, materials, 7);
  addEaveBrackets(gate, 10.1, 7.58, -0.55, materials, 7);

  // lanterns
  addHangingLantern(gate, -3.2, 5.85, 0.68, materials, lampSprites, tex.glow, renderer);
  addHangingLantern(gate, 3.2, 5.85, 0.68, materials, lampSprites, tex.glow, renderer);

  // side railings / low guard walls
  for (const side of [-1, 1]) {
    placeBox(gate, 0.26, 1.15, 5.5, materials.stoneLight, side * 13.4, 0.42, 0);
    const cap = placeBox(gate, 0.36, 0.15, 5.7, materials.stone, side * 13.4, 1.56, 0);
  }

  gate.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  world.add(gate);
  markSpot(gate, 'gate', pickables);

  /* ---------------------------- central hall ------------------------- */
  const main = new THREE.Group();
  main.position.set(0, Y0, 6);
  const mainBase = placeBox(main, 42.6, 0.66, 19.2, materials.stone, 0, 0, 0);
  const mainBody = new THREE.Group();
  main.add(mainBody);
  const mainFrontMat = materials.facade({
    width: 38.5,
    height: 12.8,
    floors: 3,
    bays: 12,
    style: 'modern',
    base: '#e8decb',
    stone: '#cbbca2',
    accent: '#a45940',
    glass: '#243c34',
    seed: 31
  });
  const mainSideMat = materials.facade({
    width: 15.4,
    height: 12.8,
    floors: 3,
    bays: 5,
    style: 'modern',
    base: '#e4dac7',
    stone: '#c5b79e',
    accent: '#a45940',
    glass: '#243c34',
    seed: 32
  });
  const mainBodyGeo = new THREE.BoxGeometry(38.5, 12.8, 15.4);
  const mainBodyMesh = new THREE.Mesh(mainBodyGeo, [
    mainSideMat,
    mainSideMat,
    materials.plasterPale,
    materials.plasterPale,
    mainFrontMat,
    mainFrontMat
  ]);
  mainBodyMesh.position.set(0, 0.66 + 6.4, 0);
  mainBodyMesh.castShadow = true;
  mainBodyMesh.receiveShadow = true;
  mainBody.add(mainBodyMesh);

  // deep horizontal cornices
  for (const y of [4.86, 8.75]) {
    const band = placeBox(main, 39.4, 0.2, 15.8, materials.stoneLight, 0, 0.66 + y, 0);
    band.castShadow = true;
  }
  placeBox(main, 40.2, 0.45, 16.2, materials.plasterWarm, 0, 13.05, 0);
  // terracotta fins give the facade a strong rhythm
  for (let i = -3; i <= 3; i += 1) {
    if (i === 0) continue;
    const x = i * 4.8;
    const fin = placeBox(main, 0.3, 12.4, 0.55, materials.redWood, x, 0.8, 7.95);
    fin.castShadow = true;
  }
  // entrance steps
  for (let i = 0; i < 4; i += 1) {
    placeBox(main, 15.8 - i * 1.2, 0.15, 1.25 + i * 1.1, materials.stoneLight, 0, 0.02 + i * 0.15, 10.5 + i * 0.55);
  }
  // portico
  for (const x of [-5.5, -1.9, 1.9, 5.5]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 7.3, 10), materials.plasterPale);
    col.position.set(x, 0.75 + 3.65, 12.3);
    col.castShadow = true;
    main.add(col);
    placeBox(main, 1.05, 0.28, 1.05, materials.stoneLight, x, 0.68, 12.3);
    placeBox(main, 0.86, 0.2, 0.86, materials.gold, x, 7.15, 12.3);
  }
  placeBox(main, 14.4, 0.42, 4.7, materials.plasterWarm, 0, 7.35, 12.4);
  const entryCanopy = createHipRoof({ w: 15.3, d: 6.7, h: 1.35, upturn: 0.28, materials, detail: true });
  entryCanopy.position.set(0, 7.8, 12.6);
  main.add(entryCanopy);
  const mainPlaqueMat = materials.signMaterial(tex.mainPlaque, true);
  const mainPlaque = plane(6.9, 1.15, mainPlaqueMat);
  mainPlaque.position.set(0, 6.55, 14.68);
  main.add(mainPlaque);
  // landing / doorway
  placeBox(main, 10.2, 3.3, 0.25, materials.darkGlass, 0, 0.75, 10.2);
  const doorLight = placeBox(main, 9.2, 0.14, 0.3, materials.lampWarm, 0, 3.8, 10.3);
  // rooftop roof
  const mainRoof = createHipRoof({ w: 43.2, d: 19.6, h: 4.3, upturn: 0.55, materials, detail: true });
  mainRoof.position.y = 13.28;
  main.add(mainRoof);
  // rooftop monitor
  const monitor = placeBox(main, 7.2, 1.15, 3.2, materials.plasterPale, 0, 16.7, -0.6);
  const monitorRoof = createHipRoof({ w: 8.2, d: 4.1, h: 0.9, upturn: 0.22, materials, detail: false });
  monitorRoof.position.set(0, 17.85, -0.6);
  main.add(monitorRoof);
  // side service stair / side door accents
  for (const side of [-1, 1]) {
    const sideCanopy = placeBox(main, 2.4, 0.18, 4.5, materials.stoneLight, side * 19.8, 4.4, 1.8);
    sideCanopy.castShadow = true;
  }

  main.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  world.add(main);
  markSpot(main, 'main', pickables);

  /* ---------------------------- Fengqi Hall -------------------------- */
  const fengqi = new THREE.Group();
  fengqi.position.set(-36, Y0, -8);
  const fBase = placeBox(fengqi, 25.8, 0.65, 14.8, materials.stone, 0, 0, 0);
  fBase.receiveShadow = true;
  for (let i = 0; i < 4; i += 1) {
    placeBox(fengqi, 13.2 - i * 1.25, 0.14, 1.1 + i * 0.7, materials.stoneLight, 0, 0.02 + i * 0.14, 7.4 + i * 0.45);
  }
  // white hall body, pulled back to leave a deep veranda
  const fBody = placeBox(fengqi, 22.1, 4.5, 7.8, materials.plasterPale, 0, 0.65, -1.45);
  fBody.castShadow = true;
  // veranda floor
  placeBox(fengqi, 24.8, 0.18, 13.4, materials.stoneLight, 0, 0.65, 0);
  // red columns around the veranda
  const frontColumns = [-9.2, -5.5, -1.85, 1.85, 5.5, 9.2];
  for (const x of frontColumns) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.27, 4.15, 9), materials.redWood);
    col.position.set(x, 0.83 + 2.075, 4.6);
    col.castShadow = true;
    fengqi.add(col);
    const baseRing = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.37, 0.2, 8), materials.stoneDark);
    baseRing.position.set(x, 0.83, 4.6);
    fengqi.add(baseRing);
    const capital = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.27, 0.2, 8), materials.gold);
    capital.position.set(x, 5.02, 4.6);
    fengqi.add(capital);
  }
  for (const side of [-1, 1]) {
    for (const z of [1.6, -1.7]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.27, 4.15, 9), materials.redWood);
      col.position.set(side * 11.1, 0.83 + 2.075, z);
      col.castShadow = true;
      fengqi.add(col);
      const capital = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.27, 0.2, 8), materials.gold);
      capital.position.set(side * 11.1, 5.02, z);
      fengqi.add(capital);
    }
  }
  // frieze
  placeBox(fengqi, 24.4, 0.32, 0.52, materials.redWood, 0, 4.89, 5.16);
  placeBox(fengqi, 24.0, 0.18, 13.0, materials.redWood, 0, 5.02, -0.2);
  placeBox(fengqi, 23.2, 0.16, 12.2, materials.gold, 0, 5.18, -0.2);
  // lattice doors and windows
  const doorMat = materials.lattice;
  const winMat = materials.latticeWindow;
  for (const x of [-6.8, 0, 6.8]) {
    const door = plane(2.65, 3.35, doorMat);
    door.position.set(x, 2.55, 2.49);
    fengqi.add(door);
    const frame = placeBox(fengqi, 2.95, 3.6, 0.12, materials.darkWood, x, 0.82, 2.41);
    frame.castShadow = false;
  }
  for (const x of [-9.3, 9.3]) {
    const win = plane(2.15, 2.5, winMat);
    win.position.set(x, 2.6, 2.51);
    fengqi.add(win);
    placeBox(fengqi, 2.4, 2.75, 0.1, materials.darkWood, x, 1.2, 2.43);
  }
  for (const side of [-1, 1]) {
    for (const z of [-1.7, 1.5]) {
      const win = plane(1.8, 2.2, winMat);
      win.position.set(side * 11.08, 2.55, z);
      win.rotation.y = side * Math.PI / 2;
      fengqi.add(win);
    }
  }
  // yellow balustrade panels between the front columns, leaving the middle open
  for (let i = 0; i < frontColumns.length - 1; i += 1) {
    if (i === 2) continue;
    const x = (frontColumns[i] + frontColumns[i + 1]) / 2;
    const panel = plane(2.75, 0.9, materials.balustrade);
    panel.position.set(x, 1.5, 4.6);
    panel.castShadow = false;
    fengqi.add(panel);
  }
  const plaqueMat = materials.signMaterial(tex.fengqiPlaque, true);
  const fPlaque = plane(3.2, 0.84, plaqueMat);
  fPlaque.position.set(0, 4.65, 2.56);
  fengqi.add(fPlaque);
  // hip roof
  const fRoof = createHipRoof({ w: 26.4, d: 15.1, h: 3.5, upturn: 0.68, materials, detail: true });
  fRoof.position.y = 5.4;
  fengqi.add(fRoof);
  addEaveBrackets(fengqi, 23.4, 5.23, 5.0, materials, 9);
  // planters + stone lanterns in the courtyard
  for (const side of [-1, 1]) {
    const planter = placeBox(fengqi, 1.45, 0.65, 1.45, materials.stone, side * 11.8, 0.02, 8.1);
    const shrub = new THREE.Mesh(new THREE.IcosahedronGeometry(0.74, 0), materials.leaf);
    shrub.position.set(side * 11.8, 1.24, 8.1);
    shrub.scale.y = 1.15;
    shrub.castShadow = true;
    fengqi.add(shrub);
  }
  fengqi.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = o.material !== materials.balustrade;
      o.receiveShadow = true;
    }
  });
  world.add(fengqi);
  markSpot(fengqi, 'fengqi', pickables);

  // a quiet bronze figure in the Fengqi courtyard
  const fStatue = createStatue(materials, 'single');
  fStatue.position.set(-36, 0.1, 6.6);
  fStatue.rotation.y = Math.PI;
  fStatue.scale.setScalar(0.95);
  world.add(fStatue);
  addHedge(world, materials, [[-51.5, -15], [-51.5, 9], [-49.8, 12]], 0.7, 0.8);
  addHedge(world, materials, [[-20.5, -15], [-20.5, 8], [-22, 12]], 0.7, 0.8);

  /* ---------------------------- H-block ----------------------------- */
  const gongzi = new THREE.Group();
  gongzi.position.set(-36, Y0, 30);
  const gBase = placeBox(gongzi, 21.8, 0.48, 20.5, materials.stone, 0, 0, 0);
  const gCentralSide = materials.facade({
    width: 17.2,
    height: 8.8,
    floors: 2,
    bays: 4,
    style: 'historic',
    base: '#e4d7c1',
    stone: '#c9b89f',
    accent: '#a55d46',
    glass: '#24392f',
    seed: 7
  });
  const gWingFront = materials.facade({
    width: 18.5,
    height: 8.8,
    floors: 2,
    bays: 5,
    style: 'historic',
    base: '#e8dcc7',
    stone: '#c8b69a',
    accent: '#a55d46',
    glass: '#24392f',
    seed: 8
  });
  const gPlain = materials.plasterWarm;
  const centralGeo = new THREE.BoxGeometry(6.3, 8.8, 17.2);
  const central = new THREE.Mesh(centralGeo, [
    gCentralSide,
    gCentralSide,
    gPlain,
    gPlain,
    gPlain,
    gPlain
  ]);
  central.position.y = 0.48 + 4.4;
  central.castShadow = true;
  central.receiveShadow = true;
  gongzi.add(central);
  for (const side of [-1, 1]) {
    const wingGeo = new THREE.BoxGeometry(18.5, 8.8, 5.4);
    const wing = new THREE.Mesh(wingGeo, [
      gPlain,
      gPlain,
      gPlain,
      gPlain,
      gWingFront,
      gWingFront
    ]);
    wing.position.set(0, 0.48 + 4.4, side * 6.8);
    wing.castShadow = true;
    wing.receiveShadow = true;
    gongzi.add(wing);
    // upper veranda rail
    for (let i = -4; i <= 4; i += 1) {
      placeBox(gongzi, 0.11, 0.55, 0.11, materials.plasterPale, i * 1.9, 5.45, side * 9.5);
    }
    placeBox(gongzi, 17.4, 0.12, 0.13, materials.plasterPale, 0, 5.92, side * 9.5);
  }
  // central intermediate eave / floor band
  placeBox(gongzi, 20.4, 0.16, 18.2, materials.stoneLight, 0, 0.48 + 4.9, 0);
  // green roofs over the three linked volumes
  const gCentralRoof = createHipRoof({ w: 8.1, d: 18.7, h: 2.1, upturn: 0.32, materials, detail: true });
  gCentralRoof.position.y = 9.36;
  gongzi.add(gCentralRoof);
  for (const side of [-1, 1]) {
    const wingRoof = createHipRoof({ w: 20.4, d: 7.0, h: 1.75, upturn: 0.32, materials, detail: true });
    wingRoof.position.set(0, 9.38, side * 6.8);
    gongzi.add(wingRoof);
  }
  // outdoor stair on the eastern face
  for (let i = 0; i < 8; i += 1) {
    placeBox(gongzi, 0.5, 0.17, 2.4, materials.stoneLight, 9.6 + i * 0.42, 0.4 + i * 0.17, -6.9);
  }
  const gPlaque = plane(2.7, 0.68, materials.signMaterial(tex.gongziPlaque, true));
  gPlaque.position.set(0, 4.35, 9.55);
  gongzi.add(gPlaque);
  gongzi.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  world.add(gongzi);
  markSpot(gongzi, 'gongzi', pickables);

  /* ---------------------------- Yanlin Hall -------------------------- */
  const yanlin = new THREE.Group();
  yanlin.position.set(36, Y0, -13);
  const yBase = placeBox(yanlin, 25.2, 0.65, 18.5, materials.stone, 0, 0, 0);
  const yFront = materials.facade({
    width: 21.5,
    height: 11.4,
    floors: 3,
    bays: 7,
    style: 'hall',
    base: '#e7ddca',
    stone: '#c9baa0',
    accent: '#a85a40',
    glass: '#1f3730',
    seed: 18
  });
  const ySide = materials.facade({
    width: 14.2,
    height: 11.4,
    floors: 3,
    bays: 5,
    style: 'hall',
    base: '#e2d8c5',
    stone: '#c4b49a',
    accent: '#a85a40',
    glass: '#1f3730',
    seed: 19
  });
  const yBodyGeo = new THREE.BoxGeometry(21.5, 11.4, 14.2);
  const yBody = new THREE.Mesh(yBodyGeo, [
    ySide,
    ySide,
    materials.plasterPale,
    materials.plasterPale,
    yFront,
    yFront
  ]);
  yBody.position.y = 0.65 + 5.7;
  yBody.castShadow = true;
  yBody.receiveShadow = true;
  yanlin.add(yBody);
  placeBox(yanlin, 22.5, 0.3, 15.2, materials.plasterWarm, 0, 12.05, 0);
  // entry steps
  for (let i = 0; i < 4; i += 1) {
    placeBox(yanlin, 12.2 - i * 0.7, 0.16, 1.1 + i * 0.8, materials.stoneLight, 0, 0.02 + i * 0.16, 8.0 + i * 0.45);
  }
  // entrance canopy
  for (const x of [-3.8, 3.8]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 6.7, 8), materials.plasterPale);
    col.position.set(x, 0.65 + 3.35, 8.7);
    col.castShadow = true;
    yanlin.add(col);
    placeBox(yanlin, 0.8, 0.22, 0.8, materials.stoneLight, x, 0.58, 8.7);
  }
  placeBox(yanlin, 10.2, 0.34, 4.4, materials.plasterWarm, 0, 6.78, 8.6);
  const yCanopyRoof = createHipRoof({ w: 11.5, d: 6.2, h: 1.2, upturn: 0.28, materials, detail: true });
  yCanopyRoof.position.set(0, 7.15, 8.7);
  yanlin.add(yCanopyRoof);
  const yPlaque = plane(3.0, 0.78, materials.signMaterial(tex.yanlinPlaque, true));
  yPlaque.position.set(0, 5.85, 7.12);
  yanlin.add(yPlaque);
  // entrance glass
  placeBox(yanlin, 7.2, 3.45, 0.18, materials.darkGlass, 0, 0.68, 7.08);
  for (const x of [-2.7, -1.35, 0, 1.35, 2.7]) {
    placeBox(yanlin, 0.05, 3.3, 0.06, materials.brass, x, 0.72, 7.16);
  }
  // roof
  const yRoof = createHipRoof({ w: 26.0, d: 17.5, h: 3.3, upturn: 0.56, materials, detail: true });
  yRoof.position.y = 12.25;
  yanlin.add(yRoof);
  // side buttresses
  for (const side of [-1, 1]) {
    for (let i = -1; i <= 1; i += 1) {
      const b = placeBox(yanlin, 0.36, 11.1, 0.8, materials.plasterWarm, side * 10.85, 0.7, i * 4.2);
    }
  }
  yanlin.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  world.add(yanlin);
  markSpot(yanlin, 'yanlin', pickables);

  const yStatue = createStatue(materials, 'group');
  yStatue.position.set(36, 0.06, 3.2);
  yStatue.rotation.y = 0.1;
  world.add(yStatue);
  addHedge(world, materials, [[24.3, -3], [24.3, 8.5], [27.5, 12]], 0.62, 0.74);
  addHedge(world, materials, [[47.7, -3], [47.7, 8.5], [44.5, 12]], 0.62, 0.74);

  /* ---------------------------- gym --------------------------------- */
  const gym = new THREE.Group();
  gym.position.set(39, Y0, 23);
  const gymBase = placeBox(gym, 27.5, 0.55, 22, materials.stone, 0, 0, 0);
  const gymFront = materials.facade({
    width: 24.2,
    height: 10.5,
    floors: 2,
    bays: 7,
    style: 'gym',
    base: '#e8d9c4',
    stone: '#c6b89e',
    accent: '#a95e45',
    glass: '#21372f',
    seed: 55
  });
  const gymSide = materials.facade({
    width: 18.4,
    height: 10.5,
    floors: 1,
    bays: 4,
    style: 'gym',
    base: '#e5d6c0',
    stone: '#c4b399',
    accent: '#a95e45',
    glass: '#21372f',
    seed: 56
  });
  const gymGeo = new THREE.BoxGeometry(24.2, 10.5, 18.4);
  const gymBody = new THREE.Mesh(gymGeo, [
    gymSide,
    gymSide,
    materials.plasterPale,
    materials.plasterPale,
    gymFront,
    gymFront
  ]);
  gymBody.position.y = 0.55 + 5.25;
  gymBody.castShadow = true;
  gymBody.receiveShadow = true;
  gym.add(gymBody);
  placeBox(gym, 25.2, 0.28, 19.4, materials.plasterWarm, 0, 11.12, 0);
  // central entry
  for (let i = 0; i < 3; i += 1) {
    placeBox(gym, 10.8 - i * 1.1, 0.17, 1.3 + i * 0.9, materials.stoneLight, 0, 0.02 + i * 0.17, 9.9 + i * 0.5);
  }
  for (const x of [-4.3, 4.3]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 5.8, 8), materials.plasterPale);
    col.position.set(x, 0.6 + 2.9, 10.0);
    col.castShadow = true;
    gym.add(col);
  }
  placeBox(gym, 11.0, 0.44, 3.9, materials.plasterWarm, 0, 6.4, 10.1);
  for (const x of [-4.9, -1.65, 1.65, 4.9]) {
    placeBox(gym, 0.16, 3.4, 0.2, materials.brass, x, 0.75, 9.55);
  }
  placeBox(gym, 6.2, 3.5, 0.2, materials.darkGlass, 0, 0.65, 9.48);
  const gymPlaque = plane(4.2, 0.88, materials.signMaterial(tex.gymPlaque, true));
  gymPlaque.position.set(0, 5.55, 10.38);
  gym.add(gymPlaque);
  // roof
  const gymRoof = createHipRoof({ w: 28.3, d: 22.5, h: 3.6, upturn: 0.48, materials, detail: true });
  gymRoof.position.y = 11.32;
  gym.add(gymRoof);
  const lanternVent = placeBox(gym, 4.6, 1.2, 3.0, materials.plasterPale, 0, 14.62, -0.5);
  const ventRoof = createHipRoof({ w: 5.6, d: 3.8, h: 0.8, upturn: 0.2, materials, detail: false });
  ventRoof.position.set(0, 15.8, -0.5);
  gym.add(ventRoof);
  // side buttresses
  for (const side of [-1, 1]) {
    for (let i = -1; i <= 1; i += 1) {
      placeBox(gym, 0.5, 10.0, 0.9, materials.plasterWarm, side * 12.25, 0.7, i * 5.2);
    }
  }
  gym.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  world.add(gym);
  markSpot(gym, 'gym', pickables);

  /* ---------------------------- sports field ------------------------- */
  const field = new THREE.Group();
  field.name = 'sports-field';
  const trackPlane = new THREE.Mesh(new THREE.PlaneGeometry(61, 26.5), materials.track);
  trackPlane.name = 'track-plane';
  trackPlane.rotation.x = -Math.PI / 2;
  trackPlane.position.set(0, Y0 + 0.05, -32);
  trackPlane.receiveShadow = true;
  field.add(trackPlane);
  // goals
  const goalA = createGoal(materials, 1);
  goalA.position.set(-20.3, Y0 + 0.08, -32);
  goalA.rotation.y = Math.PI / 2;
  field.add(goalA);
  const goalB = createGoal(materials, -1);
  goalB.position.set(20.3, Y0 + 0.08, -32);
  goalB.rotation.y = -Math.PI / 2;
  field.add(goalB);
  // simple stepped bleachers west of the track
  for (let i = 0; i < 3; i += 1) {
    placeBox(field, 2.1, 0.55 + i * 0.55, 17, materials.stoneLight, -34.5 - i * 1.4, 0.05, -32);
  }
  placeBox(field, 0.24, 0.9, 17.2, materials.roofEdge, -37.8, 1.85, -32);
  // floodlights
  for (const [x, z] of [[-29, -19], [29, -19], [-29, -45], [29, -45]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 9, 6), materials.darkMetal);
    pole.position.set(x, 4.5, z);
    pole.castShadow = true;
    field.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 0.5), materials.lampWarm);
    head.position.set(x, 9.15, z);
    field.add(head);
  }
  field.traverse((o) => {
    if (o.isMesh && o.material === materials.whiteMetal) o.castShadow = true;
  });
  world.add(field);
  markSpot(field, 'field', pickables);

  /* ---------------------------- auxiliary blocks --------------------- */
  function addAuxBlock({ x, z, w, h, d, bays, floors, seed }) {
    const group = new THREE.Group();
    group.position.set(x, Y0, z);
    placeBox(group, w + 1.8, 0.38, d + 1.6, materials.stone, 0, 0, 0);
    const front = materials.facade({
      width: w,
      height: h,
      floors,
      bays,
      style: 'modern',
      base: '#e8decb',
      stone: '#cbbc9f',
      accent: '#9a5941',
      glass: '#223a32',
      seed
    });
    const side = materials.facade({
      width: d,
      height: h,
      floors,
      bays: Math.max(2, Math.round(bays * 0.55)),
      style: 'modern',
      base: '#e3d8c4',
      stone: '#c6b89c',
      accent: '#9a5941',
      glass: '#223a32',
      seed: seed + 1
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [
      side,
      side,
      materials.plasterPale,
      materials.plasterPale,
      front,
      front
    ]);
    body.position.y = 0.38 + h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const roof = createHipRoof({ w: w + 2.4, d: d + 2.2, h: 2.2, upturn: 0.3, materials, detail: false });
    roof.position.y = 0.38 + h + 0.12;
    group.add(roof);
    for (const sideX of [-1, 1]) {
      for (const sideZ of [-1, 1]) {
        const tree = createPalm(materials, {
          height: rand(4.4, 5.8),
          lean: rand(0.2, 0.5),
          phase: rand(0, 10),
          scale: rand(0.82, 1)
        });
        tree.position.set(sideX * (w / 2 + 2.6), 0, sideZ * (d / 2 + 2.2));
        world.add(tree);
        swayers.push(tree.userData.sway);
      }
    }
    world.add(group);
  }
  addAuxBlock({ x: 48, z: -30, w: 14, h: 9.6, d: 20, bays: 5, floors: 2, seed: 71 });
  addAuxBlock({ x: -47, z: -34, w: 13, h: 8.4, d: 17, bays: 4, floors: 2, seed: 74 });

  /* ---------------------------- pavilion & garden ------------------- */
  const pavilion = new THREE.Group();
  pavilion.position.set(-26, Y0, 19.5);
  const pavBase = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.5, 0.32, 6), materials.stone);
  pavBase.position.y = 0.16;
  pavBase.receiveShadow = true;
  pavilion.add(pavBase);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * TAU + Math.PI / 6;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 2.8, 7), materials.redWood);
    post.position.set(Math.cos(a) * 2.55, 1.7, Math.sin(a) * 2.55);
    post.castShadow = true;
    pavilion.add(post);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.13, 6), materials.gold);
    top.position.set(Math.cos(a) * 2.55, 3.12, Math.sin(a) * 2.55);
    pavilion.add(top);
  }
  const pavRoof = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 3.35, 1.7, 6, 1, false), materials.roof);
  pavRoof.position.y = 4.03;
  pavRoof.rotation.y = Math.PI / 6;
  pavRoof.castShadow = true;
  pavilion.add(pavRoof);
  const pavFinial = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), materials.gold);
  pavFinial.position.y = 4.95;
  pavilion.add(pavFinial);
  const bench = createBench(materials);
  bench.position.set(0, 0, 0);
  bench.scale.setScalar(0.9);
  pavilion.add(bench);
  world.add(pavilion);

  /* ---------------------------- trees & hedges ----------------------- */
  const palmSpots = [
    [-7.7, 43.5, 7.6, 0.3, 1.0],
    [7.7, 43.5, 7.3, -0.25, 0.95],
    [-7.7, 38.1, 8.2, 0.3, 1.02],
    [7.7, 38.1, 8.0, -0.2, 1.03],
    [-16.5, 36.8, 6.8, 0.5, 0.9],
    [17.1, 36.7, 7.2, -0.4, 0.94],
    [-53.2, 4.5, 6.5, 0.35, 0.86],
    [-20.6, 2.8, 6.7, -0.4, 0.9],
    [54.2, 8.1, 7.4, -0.3, 0.98],
    [54.8, 35.2, 6.3, 0.3, 0.91],
    [20.4, -0.8, 7.0, -0.35, 1.0],
    [-28.2, -19.2, 7.6, 0.4, 1.0],
    [8.1, -15.5, 6.4, -0.45, 0.88]
  ];
  for (const [x, z, h, lean, scale] of palmSpots) {
    const palm = createPalm(materials, { height: h, lean, phase: rand(0, 10), scale });
    palm.position.set(x, 0, z);
    palm.rotation.y = rand(0, TAU);
    world.add(palm);
    swayers.push(palm.userData.sway);
    addTreeContactShadow(world, materials, x, z, 2.0, 0.24);
  }

  const treeSpots = [
    [-48.5, 39.5, 6.8, 3.0, 'deep', true],
    [49.2, 41.7, 6.1, 2.7, 'light', true],
    [20.3, 16.2, 5.4, 2.2, 'deep', true],
    [37.8, 37.3, 5.2, 2.4, 'light', true],
    [-12.9, 12.8, 4.9, 2.0, 'light', false],
    [25.8, -26.0, 6.3, 2.6, 'deep', false],
    [-53.6, -34.6, 6.8, 2.9, 'gold', false],
    [15.6, -43.1, 5.4, 2.3, 'light', false],
    [51.2, 15.7, 4.9, 2.0, 'deep', true]
  ];
  for (const [x, z, h, spread, palette, blossom] of treeSpots) {
    const tree = createCanopyTree(materials, { height: h, spread, phase: rand(0, 10), blossom, palette });
    tree.position.set(x, 0, z);
    tree.rotation.y = rand(0, TAU);
    world.add(tree);
    swayers.push(tree.userData.sway);
    addTreeContactShadow(world, materials, x, z, spread * 1.15, 0.3);
  }

  // the centennial terminalia
  const heroTree = createCanopyTree(materials, {
    height: 9.5,
    spread: 5.7,
    phase: 1.7,
    hero: true,
    palette: 'deep'
  });
  heroTree.position.set(-17, 0, 25);
  world.add(heroTree);
  markSpot(heroTree, 'tree', pickables);
  swayers.push(heroTree.userData.sway);
  addTreeContactShadow(world, materials, -17, 25, 8.2, 0.45);
  const treeBase = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.9, 0.42, 14), materials.stone);
  treeBase.position.set(-17, 0.21, 25);
  treeBase.receiveShadow = true;
  world.add(treeBase);
  addHedge(world, materials, [[-22.2, 25], [-20.5, 22.3], [-17, 21.3], [-13.5, 22.3], [-11.8, 25], [-13.2, 27.7], [-17, 28.7], [-20.8, 27.7]], 0.45, 0.52);
  const treeBench = createBench(materials);
  treeBench.position.set(-12.4, 0.02, 27.8);
  treeBench.rotation.y = -1.15;
  world.add(treeBench);

  // avenue hedges and garden hedges
  addHedge(world, materials, [[-9.3, 44], [-9.3, 39.8]], 0.55, 0.55);
  addHedge(world, materials, [[9.3, 44], [9.3, 39.8]], 0.55, 0.55);
  addHedge(world, materials, [[-19.2, 31.8], [-22.2, 29], [-23.2, 24.7]], 0.58, 0.62);
  addHedge(world, materials, [[19.2, 31.8], [22.2, 29], [23.2, 24.7]], 0.58, 0.62);
  addHedge(world, materials, [[-19.3, 15.3], [-21.7, 12.9], [-23.1, 9.2]], 0.56, 0.62);
  addHedge(world, materials, [[19.3, 15.3], [21.7, 12.9], [23.1, 9.2]], 0.56, 0.62);
  addHedge(world, materials, [[-8.4, 8.2], [-14.2, 8.2]], 0.44, 0.56);
  addHedge(world, materials, [[8.4, 8.2], [14.2, 8.2]], 0.44, 0.56);
  addFlowerBeds(world, materials);

  // a few blue-green ceramic pots with shrubs
  for (const [x, z] of [[-2.2, 42], [2.2, 42], [-43.5, -1.4], [45, 8.2]]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.36, 0.7, 10), materials.yellowTile);
    pot.position.set(x, 0.35, z);
    pot.castShadow = true;
    world.add(pot);
    const shrub = new THREE.Mesh(new THREE.IcosahedronGeometry(0.66, 0), materials.leafDeep);
    shrub.position.set(x, 1.02, z);
    shrub.castShadow = true;
    world.add(shrub);
  }

  /* ---------------------------- lamps -------------------------------- */
  const lampPositions = [
    [-8.4, 36.2],
    [8.4, 36.2],
    [-8.4, 26.8],
    [8.4, 26.8],
    [-9.2, 17.2],
    [9.2, 17.2],
    [-24.4, 7.1],
    [-47.6, 7.1],
    [27.7, 3.2],
    [44.4, 3.2],
    [29.4, 31.2],
    [49.2, 31.2],
    [-41.6, 30.2]
  ];
  for (const [x, z] of lampPositions) {
    const lamp = createLampPost(materials, tex.glow, lampSprites, lampGlowMaterials);
    lamp.position.set(x, 0, z);
    lamp.rotation.y = rand(0, Math.PI);
    world.add(lamp);
  }

  // a handful of real lights for the three most important places
  const gateLight = new THREE.PointLight(0xffb26b, 0, 25, 2);
  gateLight.position.set(0, 5.2, 52);
  campus.add(gateLight);
  const courtLight = new THREE.PointLight(0xffb26b, 0, 22, 2);
  courtLight.position.set(-36, 4, 8);
  campus.add(courtLight);
  const plazaLight = new THREE.PointLight(0xffbf7d, 0, 20, 2);
  plazaLight.position.set(0, 4, 32);
  campus.add(plazaLight);
  const gymLight = new THREE.PointLight(0xffb26b, 0, 20, 2);
  gymLight.position.set(39, 4, 34);
  campus.add(gymLight);
  const lampLights = [gateLight, courtLight, plazaLight, gymLight];

  /* ---------------------------- motes -------------------------------- */
  const moteCount = 80;
  const motePositions = new Float32Array(moteCount * 3);
  const moteSeeds = [];
  for (let i = 0; i < moteCount; i += 1) {
    const x = rand(-48, 48);
    const y = rand(0.5, 11);
    const z = rand(-18, 45);
    motePositions[i * 3] = x;
    motePositions[i * 3 + 1] = y;
    motePositions[i * 3 + 2] = z;
    moteSeeds.push({ speed: rand(0.1, 0.35), phase: rand(0, TAU), drift: rand(0.1, 0.4) });
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
  const moteMat = new THREE.PointsMaterial({
    color: 0xffd7a3,
    size: 0.32,
    map: tex.leafParticle,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  world.add(motes);

  /* ---------------------------- people ------------------------------- */
  const studentPaths = [
    [[0, 44], [0, 36], [0, 28], [0, 18]],
    [[-8, 24], [-3, 20], [3, 19], [8, 23]],
    [[-28, 28], [-19, 23], [-13, 19], [-7, 16]],
    [[28, 29], [20, 23], [14, 18], [8, 14]],
    [[31, -2], [36, 3], [38, 8]],
    [[-50, 10], [-43, 6], [-36, 5]]
  ];
  const pathCurves = studentPaths.map(
    (points) => new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)))
  );
  for (let i = 0; i < 13; i += 1) {
    const s = createStudent(materials);
    const curve = pathCurves[i % pathCurves.length];
    const offset = rand(0, 1);
    const speed = rand(0.007, 0.018);
    const scale = rand(0.86, 1.04);
    s.scale.setScalar(scale);
    s.position.copy(curve.getPoint(offset));
    s.position.y = 0.1;
    s.rotation.y = rand(0, TAU);
    world.add(s);
    if (i < 8) walkers.push({ group: s, curve, offset, speed, scale });
  }
  // small groups standing near the main axis
  for (const [x, z, n] of [[-4.5, 20.5, 3], [5.8, 37.8, 2], [-31.8, 12.2, 2], [34.8, 5.8, 2]]) {
    for (let i = 0; i < n; i += 1) {
      const s = createStudent(materials);
      s.position.set(x + rand(-0.5, 0.5), 0.1, z + rand(-0.5, 0.5));
      s.rotation.y = rand(0, TAU);
      s.scale.setScalar(rand(0.82, 1));
      world.add(s);
    }
  }

  /* ---------------------------- selection ring ----------------------- */
  const selection = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xb75c41,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.982, 0.996, 80), ringMat);
  ring.rotation.x = -Math.PI / 2;
  selection.add(ring);
  for (let i = 0; i < 4; i += 1) {
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.2), ringMat);
    tick.rotation.x = -Math.PI / 2;
    tick.rotation.z = (i / 4) * TAU;
    tick.position.set(Math.cos((i / 4) * TAU) * 1.03, 0, Math.sin((i / 4) * TAU) * 1.03);
    tick.scale.set(0.55, 0.55, 1);
    selection.add(tick);
  }
  selection.visible = false;
  world.add(selection);
  const selectionSpots = {
    gate: { x: 0, z: 48, r: 9.6 },
    main: { x: 0, z: 6, r: 20.5 },
    fengqi: { x: -36, z: -7, r: 13.2 },
    gongzi: { x: -36, z: 30, r: 11.2 },
    yanlin: { x: 36, z: -13, r: 12.2 },
    gym: { x: 39, z: 23, r: 12.3 },
    tree: { x: -17, z: 25, r: 6.0 },
    field: { x: 0, z: -32, r: 31 }
  };
  let selectedId = null;

  function setSelection(id) {
    if (!id || !selectionSpots[id]) {
      selection.visible = false;
      selectedId = null;
      return;
    }
    const info = selectionSpots[id];
    selectedId = id;
    selection.visible = true;
    selection.position.set(info.x, 0.3, info.z);
    selection.scale.setScalar(info.r);
    if (id === 'field') selection.scale.set(info.r * 0.92, 1, info.r * 0.42);
  }

  /* ---------------------------- drawing sheet ------------------------ */
  const siteDrawing = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 1280;
    const g = canvas.getContext('2d');
    const c = 640;
    const random = mulberry32(771);
    const paper = g.createRadialGradient(c, c, 80, c, c, 625);
    paper.addColorStop(0, 'rgba(239, 230, 216, .34)');
    paper.addColorStop(0.64, 'rgba(239, 230, 216, .22)');
    paper.addColorStop(1, 'rgba(239, 230, 216, 0)');
    g.fillStyle = paper;
    g.fillRect(0, 0, 1280, 1280);
    // contour study
    for (let i = 0; i < 13; i += 1) {
      const r = 206 + i * 30;
      g.strokeStyle = `rgba(38, 59, 47, ${0.055 + (i % 3) * 0.012})`;
      g.lineWidth = i % 4 === 0 ? 1.4 : 0.8;
      g.beginPath();
      for (let a = 0; a < 360; a += 2) {
        const rad = (a * Math.PI) / 180;
        const wobble = 1 + Math.sin(rad * 3 + i * 0.8) * 0.018 + Math.cos(rad * 5 - i) * 0.012;
        const x = c + Math.cos(rad) * r * 1.25 * wobble;
        const y = c + Math.sin(rad) * r * 0.79 * wobble;
        if (a === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.stroke();
    }
    // survey grid crossings
    g.strokeStyle = 'rgba(38, 59, 47, .08)';
    g.lineWidth = 0.7;
    for (let x = 80; x < 1280; x += 80) {
      g.beginPath();
      g.moveTo(x, 280);
      g.lineTo(x, 1000);
      g.stroke();
    }
    for (let y = 280; y < 1040; y += 80) {
      g.beginPath();
      g.moveTo(80, y);
      g.lineTo(1200, y);
      g.stroke();
    }
    // radial ticks
    g.strokeStyle = 'rgba(38, 59, 47, .22)';
    for (let i = 0; i < 64; i += 1) {
      const a = (i / 64) * TAU;
      const r0 = 590;
      const r1 = i % 4 === 0 ? 608 : 600;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
      g.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
      g.stroke();
    }
    // registration crosses
    g.strokeStyle = 'rgba(38, 59, 47, .3)';
    g.lineWidth = 1;
    for (const [x, y] of [[150, 190], [1130, 190], [150, 1080], [1130, 1080]]) {
      g.beginPath();
      g.moveTo(x - 9, y);
      g.lineTo(x + 9, y);
      g.moveTo(x, y - 9);
      g.lineTo(x, y + 9);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  })();
  const siteDrawingMaterial = new THREE.MeshBasicMaterial({
    map: siteDrawing,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide
  });
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(360, 360), siteDrawingMaterial);
  sheet.rotation.x = -Math.PI / 2;
  sheet.position.y = -6.05;
  sheet.renderOrder = -2;
  world.add(sheet);

  /* ---------------------------- environment time --------------------- */
  const colors = {
    dayZenith: new THREE.Color('#7e9fa4'),
    dayHorizon: new THREE.Color('#eedcc3'),
    duskZenith: new THREE.Color('#747b8b'),
    duskHorizon: new THREE.Color('#efb28e'),
    nightZenith: new THREE.Color('#061313'),
    nightHorizon: new THREE.Color('#1e2d2a'),
    sunNoon: new THREE.Color('#fff4d8'),
    sunGolden: new THREE.Color('#ffc477'),
    moon: new THREE.Color('#97abad'),
    hemiSky: new THREE.Color('#c1d4cf'),
    hemiGround: new THREE.Color('#5a5f4c'),
    hemiNightSky: new THREE.Color('#2b4547'),
    hemiNightGround: new THREE.Color('#20241e'),
    fogDay: new THREE.Color('#e4d8c2'),
    fogNight: new THREE.Color('#111f1c')
  };
  const tmpColor = new THREE.Color();
  const tmpColor2 = new THREE.Color();
  const sunDir = new THREE.Vector3();
  let hour = 16.3;
  let currentNight = 0;

  scene.fog = new THREE.Fog(0xe4d8c2, 235, 520);

  function setTime(nextHour) {
    hour = THREE.MathUtils.clamp(nextHour, 6, 20.8);
    const phi = clampCycle((hour - 6) / 13) * Math.PI;
    const sunHeight = Math.max(0, Math.sin(phi));
    const night = 1 - THREE.MathUtils.smoothstep(sunHeight, 0.015, 0.19);
    currentNight = night;
    const dusk = 1 - THREE.MathUtils.smoothstep(sunHeight, 0.06, 0.55);
    const azimuth = phi;

    sunDir.set(Math.cos(azimuth), Math.max(0.035, sunHeight), 0.38 + 0.2 * sunHeight).normalize();
    sun.position.copy(sunDir).multiplyScalar(150).add(new THREE.Vector3(0, 0, -4));
    sun.target.position.set(0, 0, -4);
    sun.target.updateMatrixWorld();
    sun.intensity = (0.12 + Math.pow(sunHeight, 0.48) * 3.2) * (1 - night * 0.9);
    sun.color.copy(colors.sunNoon).lerp(colors.sunGolden, Math.min(1, dusk * 0.92 + 0.08));
    sun.castShadow = sun.intensity > 0.18;

    moon.intensity = 0.24 + night * 0.28;
    moon.color.copy(colors.moon);
    hemi.intensity = 0.36 + Math.max(0, sunHeight) * 0.88 + night * 0.12;
    hemi.color.copy(colors.hemiSky).lerp(colors.hemiNightSky, night);
    hemi.groundColor.copy(colors.hemiGround).lerp(colors.hemiNightGround, night);
    fill.intensity = 0.12 + (1 - night) * 0.16;
    fill.color.copy(colors.hemiSky).lerp(colors.moon, night * 0.6);

    const zenith = tmpColor.copy(colors.dayZenith).lerp(colors.duskZenith, dusk).lerp(colors.nightZenith, night);
    const horizon = tmpColor2.copy(colors.dayHorizon).lerp(colors.duskHorizon, dusk).lerp(colors.nightHorizon, night);
    skyUniforms.uZenith.value.copy(zenith);
    skyUniforms.uHorizon.value.copy(horizon);
    skyUniforms.uSunDir.value.copy(sunDir);
    skyUniforms.uSunColor.value.copy(colors.sunNoon).lerp(colors.sunGolden, dusk);
    skyUniforms.uSunStrength.value = (0.45 + sunHeight * 0.85) * (1 - night * 0.83);
    skyUniforms.uNight.value = night;
    stars.material.opacity = night * 0.95;

    if (scene.fog) {
      scene.fog.color.copy(colors.fogDay).lerp(colors.fogNight, night);
      scene.fog.near = 210 + night * 50;
      scene.fog.far = 480;
    }

    const windowIntensity = night * 1.15;
    for (const mat of facadeMaterials) mat.emissiveIntensity = windowIntensity * 0.94;
    for (const mat of windowMaterials) mat.emissiveIntensity = night * 1.15;
    for (const mat of lampSprites) mat.opacity = night * 0.64;
    for (const mat of lampGlowMaterials) mat.opacity = night * 0.26;
    materials.lampWarm.emissiveIntensity = 0.15 + night * 3.4;
    for (const light of lampLights) light.intensity = night * 8.5;
    for (const mat of materials.signMaterials) mat.emissiveIntensity = 0.07 + night * 0.7;
    if (siteDrawingMaterial) siteDrawingMaterial.opacity = 0.86 - night * 0.5;
    moteMat.opacity = night > 0.45 ? 0.62 : 0.44;
    moteMat.color.set(night > 0.45 ? 0xffd382 : 0xffd6a0);
    underShadowMat.opacity = 0.16 + (1 - night) * 0.26;
  }

  setTime(hour);

  /* ---------------------------- animation ---------------------------- */
  const clock = new THREE.Clock();
  let elapsed = 0;
  let lastNightTick = -1;

  function animate(delta) {
    elapsed += delta;
    const t = reducedMotion ? 0 : elapsed;
    for (const sway of swayers) {
      if (!sway) continue;
      sway.node.rotation.z = Math.sin(t * 0.65 + sway.phase) * sway.amplitude;
      sway.node.rotation.x = Math.cos(t * 0.48 + sway.phase * 0.8) * sway.amplitude * 0.66;
    }

    // flag cloth
    const pos = flagGeo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const baseX = flagBasePositions[i * 3];
      const baseY = flagBasePositions[i * 3 + 1];
      const k = baseX / 4.1;
      pos.setZ(
        i,
        Math.sin(baseX * 1.35 - t * 3.6 + baseY * 0.38) * 0.2 * k +
          Math.sin(baseX * 0.6 + t * 2.4) * 0.08 * k
      );
      pos.setY(i, baseY + Math.sin(baseX * 0.7 - t * 2.2) * 0.06 * k);
    }
    pos.needsUpdate = true;
    if (!reducedMotion) flagGeo.computeVertexNormals();

    // walkers
    for (const walker of walkers) {
      walker.offset = (walker.offset + delta * walker.speed) % 1;
      const p = walker.curve.getPoint(walker.offset);
      walker.group.position.set(p.x, 0.1 + Math.abs(Math.sin(t * 3.4 + walker.offset * 20)) * 0.035, p.z);
      const tangent = walker.curve.getTangent(walker.offset);
      walker.group.rotation.y = Math.atan2(tangent.x, tangent.z);
    }

    // floating motes
    if (!reducedMotion) {
      const mp = moteGeo.attributes.position;
      for (let i = 0; i < moteCount; i += 1) {
        const s = moteSeeds[i];
        let y = mp.getY(i) - delta * s.speed;
        let x = mp.getX(i) + Math.sin(t * 0.35 + s.phase) * delta * s.drift * 0.18;
        let z = mp.getZ(i) + Math.cos(t * 0.26 + s.phase) * delta * s.drift * 0.13;
        if (y < 0.25) {
          y = rand(6, 12);
          x = rand(-45, 45);
          z = rand(-15, 40);
        }
        mp.setXYZ(i, x, y, z);
      }
      mp.needsUpdate = true;
      stars.rotation.y += delta * 0.004;
    }

    selection.rotation.y += delta * 0.22;
    const pulse = 1 + Math.sin(t * 2.1) * 0.015;
    selection.scale.x = selectedId === 'field' ? selectionSpots.field.r * 0.92 * pulse : selection.scale.x;
    // keep a gentle pulse; scale.y stays 1
    selection.children.forEach((child) => {
      if (child.material === ringMat) child.material.opacity = 0.23 + Math.sin(t * 2.4) * 0.05;
    });

    skyUniforms.uTime.value = t;
  }

  /* ---------------------------- public API --------------------------- */
  return {
    campus,
    world,
    pickables,
    setTime,
    getTime: () => hour,
    getNight: () => currentNight,
    tick: animate,
    setSelection,
    hideSelection: () => setSelection(null),
    selection,
    landmarks: {
      gate,
      main,
      fengqi,
      gongzi,
      yanlin,
      gym,
      field,
      tree: heroTree
    },
    sun
  };
}

// Reused by the accuracy pass / alternative site builder.
export {
  buildMaterials,
  createHipRoof,
  createPalm,
  createCanopyTree,
  addHedge,
  addFlowerBeds,
  addTreeContactShadow,
  createStudent,
  createLampPost,
  createGoal,
  createBench,
  createStatue,
  addPath,
  ribbonGeometry,
  addEaveBrackets,
  addHangingLantern,
  markSpot,
  placeBox,
  box,
  plane,
  flatShapeMesh,
  tubeBetween,
  roundedRectShape,
  mulberry32
};
