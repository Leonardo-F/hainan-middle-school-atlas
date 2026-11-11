/**
 * 电子宠物「海海」——海南中学校园吉祥物（虎鲸）的程序化三维再现。
 *
 * 设计原则：
 * - 零外部素材：身体/背鳍/尾鳍/帽子/校徽全部用 Three.js 基础几何 + Canvas 贴图拼成，
 *   和整站「程序当美术」的做法一致；
 * - 不抢主场景：宠物挂在相机前方右下角，随视角移动，不参与射线拾取；
 * - 轻量状态机：饱腹/精力/亲密度按真实时间衰减，可抚摸、喂食、睡觉、隐藏；
 *   状态存 localStorage，下次打开继续养；
 * - 确定性：视觉回归（?still=1）下不读存档、不衰减、只渲染一帧，保证截图可复现。
 *
 * 形态参考：海南中学吉祥物虎鲸「海海」的公开形象（蓝色虎鲸、白色肚皮、校徽棒球帽），
 * 为写意程序化还原，非官方素材。
 */
import * as THREE from 'three';

const STORAGE_KEY = 'hainan-pet-haibai-v1';
const DAY_MS = 24 * 60 * 60 * 1000;

const BODY_BLUE = 0x2f86c8;
const BODY_DEEP = 0x1f6fa8;
const BELLY = 0xf6f2e7;
const CAP_BLUE = 0x1d5fa8;
const INK = 0x1b2a33;

const MOODS = {
  happy: { label: '超开心', en: 'HAPPY' },
  idle: { label: '悠闲巡游', en: 'CRUISING' },
  hungry: { label: '肚子饿了', en: 'HUNGRY' },
  sleepy: { label: '有点困', en: 'SLEEPY' },
  sleeping: { label: '呼呼大睡', en: 'SLEEPING' }
};

function clamp01(value) {
  return Math.max(0, Math.min(100, value));
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d') };
}

function badgeTexture() {
  const { canvas, ctx } = makeCanvas(128, 128);
  ctx.clearRect(0, 0, 128, 128);
  ctx.beginPath();
  ctx.arc(64, 64, 58, 0, Math.PI * 2);
  ctx.fillStyle = '#f7f3e6';
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#1d5fa8';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(64, 64, 45, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#c0392b';
  ctx.stroke();
  ctx.fillStyle = '#1d5fa8';
  ctx.font = '700 46px "Songti SC", "STSong", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('海中', 64, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function heartTexture() {
  const { canvas, ctx } = makeCanvas(64, 64);
  ctx.fillStyle = '#e8707f';
  ctx.beginPath();
  ctx.moveTo(32, 56);
  ctx.bezierCurveTo(2, 34, 8, 10, 32, 22);
  ctx.bezierCurveTo(56, 10, 62, 34, 32, 56);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function standard(color, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.62,
    metalness: 0.02,
    ...extra
  });
}

function buildOrca() {
  const group = new THREE.Group();
  group.name = 'pet-haibai';

  const blue = standard(BODY_BLUE);
  const deepBlue = standard(BODY_DEEP, { roughness: 0.55 });
  const white = standard(BELLY, { roughness: 0.72 });
  const capBlue = standard(CAP_BLUE, { roughness: 0.5 });
  const ink = standard(INK, { roughness: 0.4 });
  const pink = standard(0xf0a5ad, { roughness: 0.8 });
  const eyeWhite = standard(0xfdfbf2, { roughness: 0.35 });
  const nose = standard(0x2a3b45, { roughness: 0.5 });

  const bodyGroup = new THREE.Group();
  group.add(bodyGroup);

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 22), blue);
  body.scale.set(1.04, 0.9, 1.2);
  bodyGroup.add(body);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 18), white);
  belly.scale.set(0.8, 0.64, 0.7);
  belly.position.set(0, -0.16, 0.24);
  bodyGroup.add(belly);

  // 眼白 / 瞳孔 / 高光
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.16, 0.17, 0.5);
    eye.rotation.y = side * 0.12;
    const whitePart = new THREE.Mesh(new THREE.SphereGeometry(0.062, 18, 14), eyeWhite);
    whitePart.scale.set(1, 1.1, 0.62);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.036, 14, 12), ink);
    pupil.position.set(side * 0.004, -0.002, 0.035);
    pupil.scale.set(1, 1.05, 0.6);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), eyeWhite);
    shine.position.set(side * 0.012, 0.016, 0.06);
    eye.add(whitePart, pupil, shine);
    bodyGroup.add(eye);
    eyes.push(eye);
  }

  // 腮红
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), pink);
    cheek.position.set(side * 0.255, 0.02, 0.47);
    cheek.rotation.y = side * 0.35;
    bodyGroup.add(cheek);
  }

  // 嘴（小弧线）
  const mouthCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.07, -0.045, 0.535),
    new THREE.Vector3(0, -0.095, 0.555),
    new THREE.Vector3(0.07, -0.045, 0.535)
  );
  const mouth = new THREE.Mesh(new THREE.TubeGeometry(mouthCurve, 12, 0.011, 6, false), nose);
  bodyGroup.add(mouth);

  // 背鳍
  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 5), deepBlue);
  dorsal.scale.set(0.42, 1, 1);
  dorsal.position.set(0, 0.42, -0.06);
  dorsal.rotation.x = -0.22;
  bodyGroup.add(dorsal);

  // 胸鳍
  const fins = [];
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 4), deepBlue);
    fin.scale.set(0.4, 1, 1);
    fin.position.set(side * 0.46, -0.1, 0.14);
    fin.rotation.z = side * 0.9;
    fin.rotation.y = side * 0.25;
    bodyGroup.add(fin);
    fins.push(fin);
  }

  // 尾鳍（两片，通过尾部 group 摆动）
  const tail = new THREE.Group();
  tail.position.set(0, 0.02, -0.58);
  for (const side of [-1, 1]) {
    const fluke = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), deepBlue);
    fluke.scale.set(1.5, 0.16, 0.62);
    fluke.position.set(side * 0.14, 0, -0.04);
    fluke.rotation.y = side * 0.3;
    tail.add(fluke);
  }
  bodyGroup.add(tail);

  // 校徽棒球帽
  const cap = new THREE.Group();
  cap.position.set(0, 0.33, 0.03);
  cap.rotation.x = -0.08;
  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    capBlue
  );
  crown.scale.set(1.06, 0.72, 1.06);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.028, 24, 1, false, 0, Math.PI), capBlue);
  brim.position.set(0, 0.005, 0.22);
  brim.rotation.y = Math.PI / 2;
  brim.rotation.x = -0.04;
  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), new THREE.MeshStandardMaterial({
    map: badgeTexture(), transparent: true, roughness: 0.5, metalness: 0.02
  }));
  badge.position.set(0, 0.16, 0.355);
  badge.rotation.x = -0.12;
  cap.add(crown, brim, badge);
  bodyGroup.add(cap);

  // 肚皮上的小铭牌：让吉祥物和学校产生身份关联
  const bellyBadge = new THREE.Mesh(new THREE.CircleGeometry(0.075, 20), new THREE.MeshStandardMaterial({
    map: badgeTexture(), transparent: true, roughness: 0.6
  }));
  bellyBadge.position.set(0, -0.2, 0.585);
  bellyBadge.scale.set(1, 0.92, 1);
  bellyBadge.rotation.x = -0.18;
  bodyGroup.add(bellyBadge);

  // 被抚摸时飘出的爱心
  const heartMat = new THREE.SpriteMaterial({ map: heartTexture(), transparent: true, depthTest: false });
  const hearts = [];
  for (let i = 0; i < 3; i += 1) {
    const sprite = new THREE.Sprite(heartMat.clone());
    sprite.scale.setScalar(0.16);
    sprite.visible = false;
    group.add(sprite);
    hearts.push({ sprite, life: 0, x: 0, y: 0, phase: 0 });
  }

  return { group, bodyGroup, eyes, fins, tail, cap, hearts };
}

export function createPet({ camera, renderer, scene, reducedMotion = false, still = false } = {}) {
  const orca = buildOrca();
  const group = orca.group;
  group.visible = true;
  scene.add(group);

  const storage = (() => {
    try {
      const probe = '__pet_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return window.localStorage;
    } catch {
      return null;
    }
  })();

  const random = mulberry32(20261112);
  const baseState = {
    hunger: 78,
    energy: 72,
    affection: 46,
    sleeping: false,
    visible: true,
    lastSeen: Date.now()
  };

  function readState() {
    if (still || !storage) return { ...baseState, lastSeen: Date.now() };
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return { ...baseState, lastSeen: Date.now() };
      const parsed = JSON.parse(raw);
      return {
        hunger: clamp01(Number(parsed.hunger) || baseState.hunger),
        energy: clamp01(Number(parsed.energy) || baseState.energy),
        affection: clamp01(Number(parsed.affection) || baseState.affection),
        sleeping: Boolean(parsed.sleeping),
        visible: parsed.visible !== false,
        lastSeen: Number(parsed.lastSeen) || Date.now()
      };
    } catch {
      return { ...baseState, lastSeen: Date.now() };
    }
  }

  const state = readState();

  function applyRealTimeDecay() {
    if (still) return;
    const elapsed = Math.min(Date.now() - state.lastSeen, 3 * DAY_MS) / 1000;
    if (elapsed <= 0) return;
    state.hunger = clamp01(state.hunger - elapsed / 180);
    state.energy = clamp01(state.energy - (state.sleeping ? elapsed / 900 : elapsed / 240));
    state.affection = clamp01(state.affection - elapsed / 480);
    if (state.sleeping && state.energy > 96) state.sleeping = false;
    state.lastSeen = Date.now();
  }
  applyRealTimeDecay();

  function save() {
    if (still || !storage) return;
    state.lastSeen = Date.now();
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify({
        hunger: state.hunger,
        energy: state.energy,
        affection: state.affection,
        sleeping: state.sleeping,
        visible: state.visible,
        lastSeen: state.lastSeen
      }));
    } catch {
      /* 忽略存储失败（隐私模式等） */
    }
  }

  function moodOf() {
    if (state.sleeping) return MOODS.sleeping;
    if (state.hunger < 24) return MOODS.hungry;
    if (state.energy < 22) return MOODS.sleepy;
    if (state.affection > 74) return MOODS.happy;
    return MOODS.idle;
  }

  // ---- 交互与动画状态 ----
  const cooldowns = { pet: 0, feed: 0 };
  let time = 0;
  let blinkIn = 2.4;
  let blink = 0;
  let bounce = 0;
  let spin = 0;
  let heartBurst = 0;
  let suppressed = false;
  let disposed = false;

  function pet() {
    if (disposed) return false;
    if (cooldowns.pet > 0) return false;
    cooldowns.pet = 1.1;
    state.affection = clamp01(state.affection + 7);
    state.energy = clamp01(state.energy - 0.6);
    state.sleeping = false;
    bounce = 1;
    heartBurst = 1;
    spin = reducedMotion ? 0 : 1;
    save();
    chirp(660, 0.09, 0.03);
    setTimeout(() => chirp(880, 0.08, 0.024), 90);
    return true;
  }

  function feed() {
    if (disposed) return false;
    if (cooldowns.feed > 0) return false;
    cooldowns.feed = 4;
    state.hunger = clamp01(state.hunger + 20);
    state.energy = clamp01(state.energy + 4);
    state.affection = clamp01(state.affection + 2);
    state.sleeping = false;
    bounce = 0.7;
    save();
    chirp(520, 0.12, 0.03);
    setTimeout(() => chirp(700, 0.1, 0.026), 110);
    return true;
  }

  function toggleSleep() {
    if (disposed) return state.sleeping;
    state.sleeping = !state.sleeping;
    if (!state.sleeping) state.energy = clamp01(state.energy + 2);
    save();
    return state.sleeping;
  }

  function setVisible(next) {
    state.visible = Boolean(next);
    group.visible = state.visible && !suppressed;
    save();
    return state.visible;
  }

  function setSuppressed(next) {
    suppressed = Boolean(next);
    group.visible = state.visible && !suppressed;
  }

  function reset() {
    Object.assign(state, { ...baseState, lastSeen: Date.now() });
    save();
  }

  let audioCtx = null;
  function chirp(freq, duration, gain) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const amp = audioCtx.createGain();
      const now = audioCtx.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.18, now + duration);
      amp.gain.setValueAtTime(0.0001, now);
      amp.gain.exponentialRampToValueAtTime(gain, now + 0.015);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(amp).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch {
      /* 音频失败不影响宠物 */
    }
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tmpVec = new THREE.Vector3();

  function place() {
    const distance = 2.55;
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance;
    const halfW = halfH * (camera.aspect || 1);
    const narrow = (camera.aspect || 1) < 0.9;
    const x = halfW * (narrow ? 0.42 : 0.62);
    const y = halfH * (narrow ? 0.05 : -0.22);
    tmpVec.set(x, y, -distance).applyQuaternion(camera.quaternion);
    group.position.copy(camera.position).add(tmpVec);
    group.quaternion.copy(camera.quaternion);
    const scale = (narrow ? 0.4 : 0.42) * halfH;
    group.scale.setScalar(scale);
  }

  function update(delta) {
    if (disposed) return;
    time += delta;
    cooldowns.pet = Math.max(0, cooldowns.pet - delta);
    cooldowns.feed = Math.max(0, cooldowns.feed - delta);
    if (!still) {
      state.hunger = clamp01(state.hunger - delta / 180);
      const sleeping = state.sleeping;
      state.energy = clamp01(state.energy + delta * (sleeping ? 1.6 : -1 / 240));
      state.affection = clamp01(state.affection - delta / 480);
      if (state.energy > 96 && sleeping) state.sleeping = false;
    }
    place();

    // 呼吸 / 漂浮
    const mood = moodOf();
    const rate = mood === MOODS.sleeping ? 0.6 : mood === MOODS.happy ? 3.2 : 2.0;
    const bob = Math.sin(time * rate) * (mood === MOODS.sleeping ? 0.012 : 0.028);
    orca.bodyGroup.position.y = bob;
    orca.bodyGroup.rotation.z = Math.sin(time * 1.1) * 0.035;
    orca.bodyGroup.rotation.y = Math.sin(time * 0.6) * 0.12;
    orca.tail.rotation.y = Math.sin(time * (mood === MOODS.happy ? 7 : 4)) * 0.35;
    orca.fins.forEach((fin, index) => {
      const side = index === 0 ? -1 : 1;
      fin.rotation.z = side * (0.9 + Math.sin(time * 2.4 + index) * 0.12);
    });
    orca.cap.rotation.z = Math.sin(time * 0.9) * 0.03;

    // 眨眼 / 睡觉闭眼
    if (mood === MOODS.sleeping) {
      blink = 1;
    } else {
      blinkIn -= delta;
      if (blinkIn <= 0) {
        blink = 0.16;
        blinkIn = 2.4 + random() * 3.4;
      }
      blink = Math.max(0, blink - delta);
    }
    const lid = mood === MOODS.sleeping || blink > 0 ? 0.12 : 1;
    orca.eyes.forEach((eye) => {
      eye.scale.y = THREE.MathUtils.lerp(eye.scale.y, lid, 0.35);
    });

    // 被抚摸的弹跳与转圈
    bounce = Math.max(0, bounce - delta * 2.2);
    const hop = Math.sin((1 - bounce) * Math.PI) * bounce * 0.06;
    group.position.y += hop;
    if (spin > 0) {
      spin = Math.max(0, spin - delta * 1.8);
      group.rotateY((1 - spin) * 0.02);
    }

    // 爱心
    if (heartBurst > 0) heartBurst = Math.max(0, heartBurst - delta);
    orca.hearts.forEach((heart, index) => {
      if (heartBurst > 0 && heart.life <= 0) {
        heart.life = 1;
        heart.x = (index - 1) * 0.16 + (random() - 0.5) * 0.06;
        heart.y = 0.05 + random() * 0.06;
        heart.phase = random() * Math.PI * 2;
      }
      if (heart.life > 0) {
        heart.life = Math.max(0, heart.life - delta * 0.85);
        const age = 1 - heart.life;
        heart.sprite.visible = true;
        heart.sprite.position.set(
          heart.x + Math.sin(age * 5 + heart.phase) * 0.05,
          heart.y + age * 0.5,
          0.15
        );
        heart.sprite.scale.setScalar(0.14 + age * 0.1);
        heart.sprite.material.opacity = Math.min(1, heart.life * 2.2);
      } else {
        heart.sprite.visible = false;
      }
    });

    if (!still && Math.round(time * 2) % 30 === 0) save();
  }

  function hitTest(raycast, ndcVec) {
    if (disposed || !group.visible) return false;
    raycaster.setFromCamera(ndcVec || ndc, camera);
    return raycaster.intersectObject(group, true).length > 0;
  }

  function getSnapshot() {
    const mood = moodOf();
    return {
      hunger: Math.round(state.hunger),
      energy: Math.round(state.energy),
      affection: Math.round(state.affection),
      sleeping: state.sleeping,
      visible: state.visible,
      mood: { ...mood },
      cooldowns: { pet: cooldowns.pet, feed: cooldowns.feed }
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.remove(group);
    group.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (material.map && material.map.dispose) material.map.dispose();
          material.dispose();
        }
      }
    });
    if (audioCtx) {
      try { audioCtx.close(); } catch { /* noop */ }
      audioCtx = null;
    }
  }

  function onPageHide() {
    save();
  }
  if (typeof window !== 'undefined' && !still) {
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('visibilitychange', () => {
      if (document.hidden) save();
    });
  }

  return {
    group,
    update,
    hitTest,
    getSnapshot,
    pet,
    feed,
    toggleSleep,
    setVisible,
    setSuppressed,
    reset,
    dispose
  };
}
