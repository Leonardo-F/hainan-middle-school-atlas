import * as THREE from 'three';
import { buildCampus } from '../js/campus-accurate.js';

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(320, 200);
const scene = new THREE.Scene();
const campus = buildCampus(scene, renderer, { reducedMotion: true });
scene.updateMatrixWorld(true);
const huge = [];
const box = new THREE.Box3();
scene.traverse((o) => {
  if (!o.isMesh) return;
  try { box.setFromObject(o); } catch (e) { return; }
  const s = box.getSize(new THREE.Vector3());
  const max = Math.max(s.x, s.y, s.z);
  if (max > 90) {
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    huge.push({
      type: o.type,
      geo: o.geometry?.type,
      max: +max.toFixed(1),
      size: [s.x, s.y, s.z].map((n) => +n.toFixed(1)),
      color: mat?.color ? mat.color.getHexString() : null,
      map: Boolean(mat?.map),
      pos: [o.position.x, o.position.y, o.position.z].map((n) => +n.toFixed(1)),
      parent: o.parent?.name || o.parent?.type,
      building: o.userData?.building || null
    });
  }
});
window.__huge = huge;
document.querySelector('#out').textContent = `${huge.length} huge meshes`;
window.__sceneCheckReady = true;
