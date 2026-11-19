import * as THREE from 'three';
import { placeBox, createHipRoof } from '../scene-kit.js';

// 航拍中的红瓦围着平屋面收边，瓦坡高于内侧屋面，屋面边缘有浅色压顶。
const ROOF_RISE = 0.64;

function rimRoof(parent, M, tiles, deck, x, z, width, depth, eave) {
  const inset = 1.1;
  const corners = (w, d, y) => [
    [x - w / 2, y, z - d / 2], [x - w / 2, y, z + d / 2],
    [x + w / 2, y, z + d / 2], [x + w / 2, y, z - d / 2]
  ];
  const outer = corners(width + 0.45, depth + 0.45, eave);
  const deckWidth = width - inset * 2;
  const deckDepth = depth - inset * 2;
  const inner = corners(deckWidth, deckDepth, eave + ROOF_RISE);
  const vertices = [];
  const uv = [];
  for (let i = 0; i < outer.length; i += 1) {
    const j = (i + 1) % outer.length;
    vertices.push(...outer[i], ...outer[j], ...inner[j], ...outer[i], ...inner[j], ...inner[i]);
    const span = (i % 2 === 0 ? depth : width) / 0.42;
    uv.push(0, 0, span, 0, span, 4, 0, 0, span, 4, 0, 4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  const rim = new THREE.Mesh(geometry, tiles);
  rim.castShadow = true;
  rim.receiveShadow = true;
  parent.add(rim);
  placeBox(parent, deckWidth, ROOF_RISE - 0.16, deckDepth, deck, x, eave, z);
  for (const side of [-1, 1]) {
    placeBox(parent, deckWidth + 0.12, 0.16, 0.16, M.whiteBand,
      x, eave + ROOF_RISE - 0.1, z + side * deckDepth / 2);
    placeBox(parent, 0.16, 0.16, deckDepth, M.whiteBand,
      x + side * deckWidth / 2, eave + ROOF_RISE - 0.1, z);
  }
}

function roofTileMaterial(fallback) {
  if (typeof document === 'undefined') return fallback;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#973f36';
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#ad5546';
  ctx.fillRect(5, 3, 20, 26);
  ctx.fillStyle = '#76352d';
  ctx.fillRect(0, 29, 32, 3);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map, roughness: 0.8 });
}

// 府城艺术楼。平面来自卫星图和 2018 年航拍，立面节奏参考设计单位公开方案。
export function buildArt({ M, building }) {
  const group = new THREE.Group();
  group.name = building.name;
  group.position.set(building.center[0], 0.06, building.center[1]);
  group.rotation.y = -THREE.MathUtils.degToRad(building.obb[2]);

  const wall = new THREE.MeshStandardMaterial({ color: 0xe2e2d9, roughness: 0.82 });
  const tiles = roofTileMaterial(M.terracottaRoof);
  const deck = new THREE.MeshStandardMaterial({ color: 0xb8b3a8, roughness: 0.92 });
  const warmPanels = new THREE.MeshStandardMaterial({ color: 0x946e59, roughness: 0.82 });
  const entranceGlass = new THREE.MeshStandardMaterial({ color: 0x3c5657, roughness: 0.27, metalness: 0.14 });
  for (const [key, wing] of Object.entries(building.wings)) {
    const [left, right] = wing.x;
    const [back, front] = wing.z;
    const [width, depth] = [right - left, front - back];
    const [x, z] = [(left + right) / 2, (back + front) / 2];
    const height = wing.eave - 0.3;
    const facade = (span, bays) => M.facade({
      width: span, height, floors: wing.bands, bays, style: 'modern',
      base: '#e4e6e0', stone: '#b9bcb7', accent: '#956b54', glass: '#3d504e', seed: 71
    });
    const side = facade(depth, Math.max(4, Math.round(depth / 2.15)));
    const long = facade(width, Math.max(4, Math.round(width / 2.1)));
    placeBox(group, width, height, depth,
      [side, side, M.roofDeck, wall, key === 'front' ? wall : long, long], x, 0.14, z);
    placeBox(group, width + 0.18, 0.19, depth + 0.18, M.whiteBand, x, height + 0.14, z);
    rimRoof(group, M, tiles, deck, x, z, width, depth, wing.eave);
  }
  // 航拍可见后翼有一个高出红瓦边的浅色平顶体量。
  const rearDeck = building.wings.rear.eave + ROOF_RISE - 0.16;
  placeBox(group, 13.9, 2.04, 8.9, wall, 4.8, rearDeck, -5.85);
  placeBox(group, 14.1, 0.18, 9.1, deck, 4.8, rearDeck + 2.04, -5.85);

  // 高翼正立面：上部窗带，下部一组挑高窄窗和浅色竖向壁柱。
  const front = building.wings.front.z[1];
  const gallery = 5.95;
  placeBox(group, 13.8, 1.05, 0.09, entranceGlass, gallery, 7.25, front + 0.045);
  for (let i = -3; i <= 3; i += 1) {
    const x = gallery + i * 1.92;
    placeBox(group, 0.9, 4.6, 0.09, entranceGlass, x, 1.12, front + 0.05);
    placeBox(group, 1.08, 0.14, 0.3, M.whiteBand, x, 0.99, front + 0.09);
    placeBox(group, 0.055, 4.6, 0.085, M.darkMetal, x, 1.12, front + 0.12);
    placeBox(group, 0.9, 0.07, 0.09, M.darkMetal, x, 3.22, front + 0.12);
    placeBox(group, 0.16, 1.05, 0.08, M.whiteBand, x, 7.25, front + 0.12);
  }
  placeBox(group, 15.2, 0.24, 0.22, M.whiteBand, gallery, 6.22, front + 0.1);
  placeBox(group, 1.05, 6.7, 0.3, warmPanels, -13.16, 0.14, 10.75);

  // 入口位于两翼之间。用浅色门柱、红瓦门廊和凹入的前庭保留实际轮廓。
  const [entryX, entryZ] = building.entrance;
  placeBox(group, 7.9, 0.1, 5.5, M.stoneLight, entryX, 0.01, entryZ - 0.4);
  placeBox(group, 6.9, 0.16, 3.7, M.stoneLight, entryX, 0.11, entryZ - 0.64);
  placeBox(group, 6.8, 0.23, 3.85, M.whiteBand, entryX, 3.55, entryZ - 0.3);
  for (const x of [entryX - 2.9, entryX + 2.9]) {
    placeBox(group, 0.49, 3.32, 0.53, wall, x, 0.23, entryZ + 0.9);
    placeBox(group, 0.49, 3.32, 0.53, wall, x, 0.23, entryZ - 1.65);
  }
  const porch = createHipRoof({
    w: 7.4, d: 4.2, h: 1.05, upturn: 0.13, detail: false,
    materials: { ...M, roof: M.terracottaRoof, roofEdge: M.whiteBand, roofRidge: M.terracottaEdge }
  });
  porch.position.set(entryX, 3.78, entryZ - 0.3);
  group.add(porch);
  // 航拍中，红瓦入口与楼翼之间能看到带浅色横肋的窄顶。
  const linkZ = entryZ - 4.36;
  placeBox(group, 4.4, 0.12, 6, entranceGlass, entryX, 3.12, linkZ);
  for (const side of [-1, 1]) {
    const edgeX = entryX + side * 2.22;
    placeBox(group, 0.19, 0.24, 6, M.whiteBand, edgeX, 3.12, linkZ);
    placeBox(group, 0.23, 3.03, 0.24, M.darkMetal, edgeX, 0.09, entryZ - 6.75);
  }
  for (let rib = -4; rib <= 4; rib += 1) {
    placeBox(group, 4.55, 0.15, 0.13, M.whiteBand, entryX, 3.21, linkZ + rib * 0.65);
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.6), M.artSign);
  sign.position.set(entryX, 3.22, entryZ + 1.64);
  group.add(sign);
  return group;
}
