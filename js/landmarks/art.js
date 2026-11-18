import * as THREE from 'three';
import { placeBox, createHipRoof } from '../scene-kit.js';

// 航拍中的红瓦围着平屋面收边，四个体块各自有不同大小的平顶。
function rimRoof(parent, M, x, z, width, depth, eave) {
  const inset = 1.1;
  const rise = 0.92;
  const corners = (w, d, y) => [
    [x - w / 2, y, z - d / 2], [x - w / 2, y, z + d / 2],
    [x + w / 2, y, z + d / 2], [x + w / 2, y, z - d / 2]
  ];
  const outer = corners(width + 0.45, depth + 0.45, eave);
  const inner = corners(width - inset * 2, depth - inset * 2, eave + rise);
  const vertices = [];
  for (let i = 0; i < outer.length; i += 1) {
    const j = (i + 1) % outer.length;
    vertices.push(...outer[i], ...outer[j], ...inner[j], ...outer[i], ...inner[j], ...inner[i]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  const rim = new THREE.Mesh(geometry, M.terracottaRoof);
  rim.castShadow = true;
  rim.receiveShadow = true;
  parent.add(rim);
  placeBox(parent, width - inset * 2, rise, depth - inset * 2, M.roofDeckLight, x, eave, z);
}

// 府城艺术楼。平面来自卫星图和 2018 年航拍，立面节奏参考设计单位公开方案。
export function buildArt({ M, building }) {
  const group = new THREE.Group();
  group.name = building.name;
  group.position.set(building.center[0], 0.06, building.center[1]);
  group.rotation.y = -THREE.MathUtils.degToRad(building.obb[2]);

  const wall = new THREE.MeshStandardMaterial({ color: 0xe2e2d9, roughness: 0.82 });
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
    rimRoof(group, M, x, z, width, depth, wing.eave);
  }
  // 航拍可见后翼有一个高出红瓦边的浅色平顶体量。
  placeBox(group, 13.9, 1.92, 8.9, wall, 4.8, building.wings.rear.eave + 0.92, -5.85);
  placeBox(group, 14.1, 0.18, 9.1, M.whiteBand, 4.8, 11.44, -5.85);

  // 高翼正立面：上部窗带，下部一组挑高窄窗和浅色竖向壁柱。
  const front = building.wings.front.z[1];
  const gallery = 5.95;
  placeBox(group, 13.8, 1.05, 0.09, entranceGlass, gallery, 7.25, front + 0.045);
  for (let i = -3; i <= 3; i += 1) {
    const x = gallery + i * 1.92;
    placeBox(group, 0.9, 4.6, 0.09, entranceGlass, x, 1.12, front + 0.05);
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
  placeBox(group, 4.6, 0.19, 6, M.whiteBand, entryX, 3.12, entryZ - 4.36);
  for (const side of [-1, 1]) {
    placeBox(group, 0.23, 3.03, 0.24, M.darkMetal, entryX + side * 2.06, 0.09, entryZ - 6.75);
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.6), M.artSign);
  sign.position.set(entryX, 3.22, entryZ + 1.64);
  group.add(sign);
  return group;
}
