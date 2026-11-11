/**
 * 重点建筑模型快速预览器（开发工具，不参与正式页面构建）。
 * 用法：http://127.0.0.1:8791/tools/model-preview.html?model=gate&view=front
 *   model: gate | teaching | fengqi | yanlin
 *   view : front | persp | aerial | side | back
 * 目的：单独加载一栋建筑，便于与照片逐项比对，避免每次加载整个校园（很慢）。
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { makeTextures } from '../js/textures.js';
import { buildMaterials } from '../js/scene-kit.js';

const params = new URLSearchParams(location.search);
const modelId = (params.get('model') || 'gate').toLowerCase();
const viewName = (params.get('view') || 'persp').toLowerCase();
if (params.get('nobake') === '1') window.__NO_BAKE = true;
const names = { gate: '北门（主校门）', teaching: '1 号教学楼（主教学楼）', fengqi: '凤栖堂', yanlin: '衍林堂' };

const hudName = document.querySelector('#modelName');
const hudMeta = document.querySelector('#modelMeta');
const hudStatus = document.querySelector('#status');
hudName.textContent = names[modelId] || modelId;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#dfe6da');
scene.fog = new THREE.Fog('#dfe6da', 180, 520);

const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.1, 2000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 2;
controls.maxDistance = 800;

const hemi = new THREE.HemisphereLight(0xfff8e8, 0x8a9679, 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3d7, 2.6);
sun.position.set(-55, 85, 65);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 300 });
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.04;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xc4ded4, 0.55);
fill.position.set(40, 12, -35);
scene.add(fill);

const groundMat = new THREE.MeshStandardMaterial({ color: '#cbd4c3', roughness: 1 });
const ground = new THREE.Mesh(new THREE.CircleGeometry(150, 64), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.02;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(160, 80, 0xb8c3ae, 0xc7d0bc);
grid.material.opacity = 0.32;
grid.material.transparent = true;
scene.add(grid);

/** 与 campus-accurate.js 中一致的重点建筑材料扩展（预览器局部复制）。 */
function extendMaterials(M, tex) {
  M.terracottaRoof = new THREE.MeshStandardMaterial({ color: 0x9e5b43, roughness: 0.76, metalness: 0.03, side: THREE.DoubleSide });
  M.terracottaEdge = new THREE.MeshStandardMaterial({ color: 0x633c2d, roughness: 0.62, metalness: 0.08 });
  M.taihu = new THREE.MeshStandardMaterial({ color: 0x66645b, roughness: 0.94 });
  M.darkStone = new THREE.MeshStandardMaterial({ color: 0x5e5c54, roughness: 0.9 });
  M.bronze = new THREE.MeshStandardMaterial({ color: 0x4b463b, roughness: 0.48, metalness: 0.52 });
  M.whiteBand = new THREE.MeshStandardMaterial({ color: 0xe9e6de, roughness: 0.82 });
  M.glassBand = new THREE.MeshStandardMaterial({ color: 0x324c46, roughness: 0.3, metalness: 0.18 });
  M.plaza = new THREE.MeshStandardMaterial({ color: 0xd9d2c1, roughness: 0.95 });
  M.darkPaving = new THREE.MeshStandardMaterial({ color: 0xb7b5a9, roughness: 0.95 });
  M.studyGround = new THREE.MeshStandardMaterial({ color: 0xd9d2c1, roughness: 0.95 });
  const makeTex = (w, h, draw) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    draw(canvas.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const inscriptionTex = makeTex(640, 200, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '600 74px "Songti SC", "STSong", serif';
    g.fillStyle = '#a84432';
    g.fillText('虎踞龙盘', w / 2, h * 0.38);
    g.font = '500 36px "Songti SC", "STSong", serif';
    g.fillStyle = 'rgba(137,54,39,.9)';
    g.fillText('捷报频传', w / 2, h * 0.78);
  });
  M.inscription = new THREE.MeshBasicMaterial({ map: inscriptionTex, transparent: true, depthWrite: false });
  const chunfengTex = makeTex(512, 120, (g, w, h) => {
    g.fillStyle = '#655545';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#b9945f';
    g.lineWidth = 4;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#dfc28c';
    g.font = '500 54px "Songti SC", "STSong", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('春风化雨', w / 2, h / 2 + 2);
  });
  M.chunfeng = new THREE.MeshBasicMaterial({ map: chunfengTex });
}

async function main() {
  const tex = makeTextures(renderer);
  const M = buildMaterials(tex, renderer);
  extendMaterials(M, tex);

  let module;
  try {
    module = await import(`../js/landmarks/${modelId}.js`);
  } catch (error) {
    hudStatus.textContent = `无法加载模块：${error.message}`;
    window.__previewReady = true;
    return;
  }
  const group = module.build({ M, tex, reducedMotion: true });
  scene.add(group);
  window.__previewScene = scene;
  window.__previewGroup = group;
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  // 场景单位 → 米（group 内部按米建模，finalize 已 ×0.5）
  hudMeta.textContent = `${size.x.toFixed(1)} × ${size.z.toFixed(1)} × 高 ${size.y.toFixed(1)} 场景单位 ≈ ${(size.x * 2).toFixed(1)} m × ${(size.z * 2).toFixed(1)} m × 高 ${(size.y * 2).toFixed(1)} m`;

  const maxDim = Math.max(size.x, size.y * 1.4, size.z);
  const target = new THREE.Vector3(center.x, size.y * 0.46, center.z);
  const d = maxDim * 1.55;
  const views = {
    front: [center.x, size.y * 0.5, center.z + d],
    persp: [center.x + d * 0.85, size.y * 0.55, center.z + d * 0.9],
    aerial: [center.x + d * 0.55, size.y + d * 0.75, center.z + d * 0.65],
    side: [center.x + d, size.y * 0.55, center.z],
    back: [center.x, size.y * 0.5, center.z - d]
  };
  const pos = views[viewName] || views.persp;
  camera.position.set(...pos);
  controls.target.copy(target);
  controls.update();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  });

  function frame() {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();
  requestAnimationFrame(() => {
    window.__previewReady = true;
    hudStatus.textContent = '';
  });
}

main().catch((error) => {
  console.error(error);
  hudStatus.textContent = String(error && error.message ? error.message : error);
  window.__previewReady = true;
});
