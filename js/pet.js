/**
 * 电子宠物「海海」——海南中学校园吉祥物（蓝鲨/鲸）的程序化三维再现。
 *
 * 设计原则：
 * - 零外部素材：绒毛身体、棒球帽、校徽、满月白肚印花、书包全部用 Three.js
 *   基础几何 + Canvas 贴图拼成，和整站「程序当美术」的做法一致；
 * - 不抢主场景：宠物挂在相机前方右下角，可拖到屏幕边缘的九个安全位，
 *   不参与主场景布局；屏幕尺度约为舞台高度的 12%，不遮挡视觉中心；
 * - 轻量状态机：饱腹/精力/亲密度按真实时间衰减，可抚摸、喂食、睡觉、隐藏；
 *   状态存 localStorage，下次打开继续养；
 * - 确定性：视觉回归（?still=1）下不读存档、不衰减、不使用用户拖动位置，
 *   只渲染一帧，保证截图可复现。
 *
 * 形态参考：海南中学吉祥物「海海」的实体毛绒玩偶（蓝色鲨鱼、白色下脸与肚皮、
 * 校徽棒球帽、白色小书包），为程序化写意还原，非官方素材。
 */
import * as THREE from 'three';

const STORAGE_KEY = 'hainan-pet-haibai-v1';
const ANCHOR_KEY = 'hainan-pet-anchor-v1';
const ROTATION_KEY = 'hainan-pet-rotation-v1';
const DAY_MS = 24 * 60 * 60 * 1000;

/** 屏幕锚点：相对视口中心的归一化偏移，y 向上为正。 */
const DEFAULT_ANCHOR = Object.freeze({ x: 0.58, y: -0.06 });
const NARROW_ANCHOR = Object.freeze({ x: 0.34, y: 0.04 });
const WIDE_LIMITS = Object.freeze({ x: 0.82, yMin: -0.78, yMax: 0.55 });
const NARROW_LIMITS = Object.freeze({ x: 0.65, yMin: -0.62, yMax: 0.5 });
const NARROW_ASPECT = 0.9;

// 相机前方 2.55 处；相对 halfH 的 0.25 让 1.0 高的模型约占舞台高度 12%。
const PET_DISTANCE = 2.55;
const PET_SCALE = 0.25;

const BODY_BLUE = 0x35a6d8;
const BODY_DEEP = 0x2b93c6;
const CAP_BLUE = 0x2fa4dc;
const PACK_WHITE = 0xf3efe4;
const BELLY = 0xf7f3e8;
const INK = 0x1b2d38;
const STRAP_BLUE = 0x237fba;
const STITCH_RED = 0xe05a63;

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

function toTexture(canvas, { srgb = true, repeat = 1 } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (repeat !== 1) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
  }
  return texture;
}

/** 细密布纹：做 bumpMap，让纯色绒面在近景也有织物质感。 */
function plushBumpTexture() {
  const size = 128;
  const { canvas, ctx } = makeCanvas(size, size);
  const image = ctx.createImageData(size, size);
  const rand = mulberry32(41207);
  for (let i = 0; i < image.data.length; i += 4) {
    const value = 138 + Math.round((rand() - 0.5) * 46);
    image.data[i] = value;
    image.data[i + 1] = value;
    image.data[i + 2] = value;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return toTexture(canvas, { srgb: false, repeat: 4 });
}

/** 肚皮印花：米白绒布 + 蓝色「海南中学 / HAINAN MIDDLE SCHOOL」。 */
function bellyTexture() {
  const size = 1024;
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = '#f5f1e6';
  ctx.fillRect(0, 0, size, size);

  // 轻微纤维颗粒，避免大面积死白
  const rand = mulberry32(4711);
  ctx.globalAlpha = 0.055;
  for (let i = 0; i < 1500; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.8 + rand() * 2.2;
    ctx.fillStyle = rand() > 0.5 ? '#ffffff' : '#cdc5b3';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const ink = '#0e568f';
  ctx.fillStyle = ink;
  ctx.textBaseline = 'middle';
  ctx.font = '800 126px "Songti SC", "STSong", "Noto Serif SC", "SimSun", serif';
  drawSpacedText(ctx, '海南中学', size / 2, size * 0.352, 4);
  ctx.font = '800 46px "Helvetica Neue", "Arial", sans-serif';
  drawSpacedText(ctx, 'HAINAN MIDDLE SCHOOL', size / 2, size * 0.468, 2.5);

  return toTexture(canvas);
}

/** 白底蓝线校徽：圆形校徽 + 校门剪影 + 1923。 */
function badgeTexture() {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.arc(128, 128, 118, 0, Math.PI * 2);
  ctx.fillStyle = '#f8f4e9';
  ctx.fill();

  const blue = '#1f6fae';
  ctx.strokeStyle = blue;
  ctx.lineWidth = 20;
  ctx.beginPath();
  ctx.arc(128, 128, 106, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(128, 128, 88, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 10;
  // 校门屋顶
  ctx.beginPath();
  ctx.moveTo(72, 108);
  ctx.quadraticCurveTo(128, 68, 184, 108);
  ctx.stroke();
  // 门柱与三个拱门
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(80, 148);
  ctx.lineTo(176, 148);
  ctx.stroke();
  for (const x of [99, 128, 157]) {
    ctx.beginPath();
    ctx.moveTo(x - 11, 144);
    ctx.lineTo(x - 11, 118);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 11, 144);
    ctx.lineTo(x + 11, 118);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, 118, 11, Math.PI, 0);
    ctx.stroke();
  }
  ctx.font = '800 30px "Helvetica Neue", "Arial", sans-serif';
  ctx.fillStyle = blue;
  ctx.textAlign = 'center';
  ctx.fillText('1923', 128, 198);

  return toTexture(canvas);
}

/** 书包翻盖上的蓝字织标。 */
function packLabelTexture() {
  const w = 512;
  const h = 256;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(238, 248, 252, 0.96)';
  ctx.beginPath();
  ctx.roundRect(18, 20, w - 36, h - 40, 30);
  ctx.fill();
  ctx.strokeStyle = 'rgba(31, 111, 174, 0.7)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(24, 26, w - 48, h - 52, 26);
  ctx.stroke();

  ctx.fillStyle = '#155d96';
  ctx.textBaseline = 'middle';
  ctx.font = '800 98px "Songti SC", "STSong", "Noto Serif SC", "SimSun", serif';
  drawSpacedText(ctx, '海南中学', w / 2, 96, 5);
  ctx.font = '800 34px "Helvetica Neue", "Arial", sans-serif';
  drawSpacedText(ctx, 'HAINAN MIDDLE SCHOOL', w / 2, 172, 3.5);
  return toTexture(canvas);
}

/** 小张嘴：深蓝描边、红色开口、粉色小舌头。 */
function mouthTexture() {
  const w = 160;
  const h = 128;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2 + 4);

  // 外轮廓（深蓝绣线）
  ctx.beginPath();
  ctx.moveTo(-30, -16);
  ctx.bezierCurveTo(-18, -30, -6, -20, 0, -8);
  ctx.bezierCurveTo(6, -20, 18, -30, 30, -16);
  ctx.bezierCurveTo(44, 2, 30, 40, 0, 46);
  ctx.bezierCurveTo(-30, 40, -44, 2, -30, -16);
  ctx.closePath();
  ctx.fillStyle = '#1c303c';
  ctx.fill();

  // 红色口腔
  ctx.beginPath();
  ctx.moveTo(-23, -12);
  ctx.bezierCurveTo(-13, -22, -5, -14, 0, -4);
  ctx.bezierCurveTo(5, -14, 13, -22, 23, -12);
  ctx.bezierCurveTo(33, 3, 22, 31, 0, 36);
  ctx.bezierCurveTo(-22, 31, -33, 3, -23, -12);
  ctx.closePath();
  ctx.fillStyle = '#d94b52';
  ctx.fill();

  // 小舌头
  ctx.beginPath();
  ctx.ellipse(0, 22, 12, 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#f08a94';
  ctx.fill();

  return toTexture(canvas);
}

function drawSpacedText(ctx, text, centerX, y, spacing) {
  const chars = [...text];
  const widths = chars.map((char) => ctx.measureText(char).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + spacing * (chars.length - 1);
  let x = centerX - total / 2;
  const align = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((char, index) => {
    ctx.fillText(char, x, y);
    x += widths[index] + spacing;
  });
  ctx.textAlign = align;
}

function heartTexture() {
  const { canvas, ctx } = makeCanvas(64, 64);
  ctx.fillStyle = '#e8707f';
  ctx.beginPath();
  ctx.moveTo(32, 56);
  ctx.bezierCurveTo(2, 34, 8, 10, 32, 22);
  ctx.bezierCurveTo(56, 10, 62, 34, 32, 56);
  ctx.fill();
  return toTexture(canvas);
}

/** 脚底柔光投影：让相机前的宠物有“站在这里”的落点，而不是悬浮。 */
function shadowTexture() {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size, size);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 8, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(28, 46, 40, 0.34)');
  gradient.addColorStop(0.55, 'rgba(28, 46, 40, 0.16)');
  gradient.addColorStop(1, 'rgba(28, 46, 40, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return toTexture(canvas);
}

/** 圆角盒（书包、翻盖）：形状挤出，边缘带倒角，像软绒布包。 */
function roundedBoxGeometry(width, height, depth, radius) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: Math.min(radius * 0.42, depth * 0.4),
    bevelThickness: Math.min(radius * 0.42, depth * 0.4),
    curveSegments: 8
  });
  geometry.center();
  return geometry;
}

function buildMascot() {
  const group = new THREE.Group();
  group.name = 'pet-haibai';

  const plushBump = plushBumpTexture();
  const fabric = (color, extra = {}) => new THREE.MeshStandardMaterial({
    color,
    roughness: 0.88,
    metalness: 0,
    bumpMap: plushBump,
    bumpScale: 0.0018,
    ...extra
  });

  const blue = fabric(BODY_BLUE);
  const deepBlue = fabric(BODY_DEEP, { roughness: 0.9 });
  const capBlue = fabric(CAP_BLUE, { roughness: 0.86 });
  const brimBlue = fabric(0x2a9bd0, { roughness: 0.82 });
  const capBandBlue = fabric(0x2687b8, { roughness: 0.82 });
  const white = fabric(BELLY, { roughness: 0.92 });
  const packWhite = fabric(PACK_WHITE, { roughness: 0.93 });
  const flapWhite = fabric(0xfaf7ef, { roughness: 0.93 });
  const strapBlue = fabric(0x1c72aa, { roughness: 0.78 });
  const ink = new THREE.MeshStandardMaterial({ color: INK, roughness: 0.24, metalness: 0.02 });
  const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const stitch = new THREE.MeshStandardMaterial({
    color: 0xd63f4d,
    roughness: 0.58,
    emissive: 0x6a1b24,
    emissiveIntensity: 0.55
  });
  const buckle = new THREE.MeshStandardMaterial({ color: 0xbfe7f6, roughness: 0.5 });

  const bodyGroup = new THREE.Group();
  group.add(bodyGroup);

  // 脚底柔光投影（sprite 永远面向相机，落在双脚下方）
  const footShadow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: shadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.62
  }));
  footShadow.scale.set(0.72, 0.19, 1);
  footShadow.position.set(0, -0.55, 0.02);
  group.add(footShadow);

  /* ----------------------------- 脚与腿 ----------------------------- */
  for (const side of [-1, 1]) {
    // 短腿
    const leg = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), blue);
    leg.scale.set(0.074, 0.092, 0.078);
    leg.position.set(side * 0.102, -0.386, 0.018);
    bodyGroup.add(leg);

    // 圆头脚掌，向前伸出
    const foot = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), blue);
    foot.scale.set(0.09, 0.064, 0.122);
    foot.position.set(side * 0.103, -0.434, 0.045);
    bodyGroup.add(foot);

    // 白色椭圆鞋底
    const sole = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), white);
    sole.scale.set(0.064, 0.013, 0.09);
    sole.position.set(side * 0.103, -0.497, 0.054);
    bodyGroup.add(sole);

    // 鞋底上沿的一道白边（正视可见）
    const soleStripe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.072, 0.075, 0.014, 24, 1, true),
      white
    );
    soleStripe.scale.z = 1.32;
    soleStripe.position.set(side * 0.103, -0.48, 0.048);
    bodyGroup.add(soleStripe);
  }

  /* ------------------------------ 身体 ------------------------------ */
  const profile = [
    [0.075, -0.355],
    [0.14, -0.345],
    [0.178, -0.315],
    [0.198, -0.26],
    [0.205, -0.195],
    [0.198, -0.125],
    [0.188, -0.075],
    [0.172, -0.02],
    [0.148, 0.035],
    [0.12, 0.065]
  ].map(([radius, y]) => new THREE.Vector2(radius, y));
  const torso = new THREE.Mesh(new THREE.LatheGeometry(profile, 40), blue);
  torso.scale.z = 0.9;
  bodyGroup.add(torso);

  // 白色肚皮：前半球薄壳，略微鼓出身体，接缝像毛绒拼布
  const bellyPanel = new THREE.Mesh(
    new THREE.SphereGeometry(1, 40, 30, 0, Math.PI, 0.3, Math.PI - 0.3),
    new THREE.MeshStandardMaterial({
      map: bellyTexture(),
      roughness: 0.92,
      metalness: 0,
      bumpMap: plushBump,
      bumpScale: 0.0012
    })
  );
  bellyPanel.scale.set(0.18, 0.15, 0.15);
  bellyPanel.position.set(0, -0.198, 0.058);
  bodyGroup.add(bellyPanel);

  // 胸口书包带 / 斜挎带：蓝色宽带 + 浅蓝小扣
  const chestBand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.198, 0.2, 0.034, 40, 1, true),
    strapBlue
  );
  chestBand.scale.z = 0.91;
  chestBand.position.y = -0.106;
  bodyGroup.add(chestBand);

  const bucklePlate = new THREE.Mesh(roundedBoxGeometry(0.04, 0.029, 0.014, 0.006), buckle);
  bucklePlate.position.set(-0.086, -0.106, 0.174);
  bodyGroup.add(bucklePlate);
  const buckleDot = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 8, 6), strapBlue);
  buckleDot.position.set(-0.086, -0.106, 0.183);
  bodyGroup.add(buckleDot);

  /* ------------------------------ 头部 ------------------------------ */
  const headCenter = new THREE.Vector3(0, 0.165, 0.005);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 44, 34), blue);
  head.scale.set(0.26, 0.242, 0.245);
  head.position.copy(headCenter);
  bodyGroup.add(head);

  // 白色下半脸：比头略大的前半球薄壳，从眼下包到下巴
  const faceRadius = { x: 0.262, y: 0.244, z: 0.247 };
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(1, 44, 30, 0, Math.PI, 1.44, 1.5),
    white
  );
  face.scale.set(faceRadius.x, faceRadius.y, faceRadius.z);
  face.position.copy(headCenter);
  bodyGroup.add(face);

  // 白脸顶边的蓝色包边，藏住薄壳接缝，也呼应玩偶的蓝滚边
  const pipePoints = [];
  const pipeTheta = 1.44;
  for (let i = 0; i <= 32; i += 1) {
    const phi = (i / 32) * Math.PI;
    pipePoints.push(new THREE.Vector3(
      -faceRadius.x * Math.cos(phi) * Math.sin(pipeTheta),
      headCenter.y + faceRadius.y * Math.cos(pipeTheta),
      headCenter.z + faceRadius.z * Math.sin(phi) * Math.sin(pipeTheta)
    ));
  }
  const pipeCurve = new THREE.CatmullRomCurve3(pipePoints);
  const facePipe = new THREE.Mesh(
    new THREE.TubeGeometry(pipeCurve, 40, 0.0055, 6, false),
    new THREE.MeshStandardMaterial({ color: 0x2c95ca, roughness: 0.82 })
  );
  bodyGroup.add(facePipe);

  // 黑色豆豆眼 + 白色高光
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.108, 0.217, 0.22);
    eye.rotation.y = side * 0.12;
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.036, 20, 16), ink);
    bead.scale.set(1, 1.06, 0.62);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.0105, 10, 8), eyeWhite);
    shine.position.set(-0.012, 0.013, 0.022);
    eye.add(bead, shine);
    bodyGroup.add(eye);
    eyes.push(eye);
  }

  // 张嘴（小平面贴片，带透明底）
  const mouth = new THREE.Mesh(
    new THREE.PlaneGeometry(0.09, 0.072),
    new THREE.MeshStandardMaterial({
      map: mouthTexture(),
      transparent: true,
      roughness: 0.7,
      metalness: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1
    })
  );
  mouth.position.set(0, 0.118, 0.253);
  mouth.rotation.x = -0.06;
  mouth.renderOrder = 2;
  bodyGroup.add(mouth);

  // 两颊各三道红色短绣线
  const stitchGeo = new THREE.BoxGeometry(0.05, 0.0085, 0.01);
  const stitches = new THREE.InstancedMesh(stitchGeo, stitch, 6);
  const stitchMatrix = new THREE.Matrix4();
  const stitchQuat = new THREE.Quaternion();
  const stitchPos = new THREE.Vector3();
  const stitchScale = new THREE.Vector3(1, 1, 1);
  let stitchIndex = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i += 1) {
      stitchPos.set(side * (0.147 + i * 0.002), 0.185 - i * 0.018, 0.207);
      stitchQuat.setFromEuler(new THREE.Euler(0.08, side * 0.3, side * -0.58));
      stitchMatrix.compose(stitchPos, stitchQuat, stitchScale);
      stitches.setMatrixAt(stitchIndex, stitchMatrix);
      stitchIndex += 1;
    }
  }
  stitches.instanceMatrix.needsUpdate = true;
  bodyGroup.add(stitches);

  /* ------------------------------ 书包 ------------------------------ */
  const pack = new THREE.Mesh(roundedBoxGeometry(0.285, 0.295, 0.115, 0.055), packWhite);
  pack.position.set(0, -0.198, -0.192);
  bodyGroup.add(pack);

  const flap = new THREE.Mesh(roundedBoxGeometry(0.248, 0.122, 0.052, 0.03), flapWhite);
  flap.position.set(0, -0.083, -0.245);
  flap.rotation.x = -0.05;
  bodyGroup.add(flap);

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.195, 0.098),
    new THREE.MeshStandardMaterial({
      map: packLabelTexture(),
      transparent: true,
      roughness: 0.9,
      metalness: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1
    })
  );
  label.position.set(0, -0.084, -0.288);
  label.rotation.y = Math.PI;
  bodyGroup.add(label);

  // 包身下半部的蓝色口袋（对应参考照片里的蓝色下片 + 圆形徽记）
  const packPocket = new THREE.Mesh(roundedBoxGeometry(0.22, 0.1, 0.028, 0.035), strapBlue);
  packPocket.position.set(0, -0.3, -0.268);
  bodyGroup.add(packPocket);
  const pocketBadge = new THREE.Mesh(
    new THREE.CircleGeometry(0.031, 24),
    new THREE.MeshStandardMaterial({
      map: badgeTexture(),
      transparent: true,
      alphaTest: 0.05,
      roughness: 0.8,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1
    })
  );
  pocketBadge.position.set(0, -0.3, -0.294);
  pocketBadge.rotation.y = Math.PI;
  bodyGroup.add(pocketBadge);

  // 翻盖下的蓝色插扣织带
  const packClasp = new THREE.Mesh(roundedBoxGeometry(0.036, 0.11, 0.014, 0.008), strapBlue);
  packClasp.position.set(0, -0.185, -0.278);
  bodyGroup.add(packClasp);

  const packBuckle = new THREE.Mesh(roundedBoxGeometry(0.048, 0.032, 0.02, 0.008), deepBlue);
  packBuckle.position.set(0, -0.212, -0.283);
  bodyGroup.add(packBuckle);

  // 两条蓝色肩带：从书包上沿绕过肩线，再沿白色包背垂下来
  for (const side of [-1, 1]) {
    const strapCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.16, 0.025, -0.07),
      new THREE.Vector3(side * 0.182, -0.035, -0.19),
      new THREE.Vector3(side * 0.172, -0.095, -0.278),
      new THREE.Vector3(side * 0.145, -0.19, -0.288),
      new THREE.Vector3(side * 0.115, -0.232, -0.29)
    ]);
    const shoulderStrap = new THREE.Mesh(
      new THREE.TubeGeometry(strapCurve, 26, 0.02, 8, false),
      strapBlue
    );
    bodyGroup.add(shoulderStrap);
  }

  // 藏在书包下方的小尾鳍
  const tail = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), deepBlue);
  tail.scale.set(0.13, 0.038, 0.075);
  tail.position.set(0, -0.35, -0.19);
  tail.rotation.x = 0.25;
  bodyGroup.add(tail);

  /* ------------------------------ 手臂 ------------------------------ */
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.188, -0.08, 0.055);
    const flipper = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 18), white);
    flipper.scale.set(0.061, 0.105, 0.074);
    flipper.position.y = -0.074;
    arm.add(flipper);

    const band = new THREE.Mesh(new THREE.TorusGeometry(0.053, 0.015, 8, 20), blue);
    band.rotation.x = Math.PI / 2;
    band.position.y = -0.004;
    arm.add(band);

    // 左侧（画面左）抬手打招呼，右侧自然下垂
    const base = side < 0 ? -2.02 : 0.3;
    arm.rotation.z = base;
    arm.userData.baseZ = base;
    arm.userData.side = side;
    bodyGroup.add(arm);
    arms.push(arm);
  }

  /* --------------------------- 背鳍与帽子 --------------------------- */
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.quadraticCurveTo(0.02, 0.125, 0.085, 0.185);
  finShape.quadraticCurveTo(0.14, 0.225, 0.184, 0.214);
  finShape.quadraticCurveTo(0.165, 0.13, 0.175, 0.048);
  finShape.quadraticCurveTo(0.128, -0.012, 0.02, -0.015);
  finShape.closePath();
  const finGeometry = new THREE.ExtrudeGeometry(finShape, {
    depth: 0.03,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.007,
    bevelThickness: 0.007,
    curveSegments: 12
  });
  finGeometry.center();
  // 让背鳍越往尖端越薄，避免从正后方看像一块方板
  finGeometry.computeBoundingBox();
  const finYMin = finGeometry.boundingBox.min.y;
  const finYSpan = Math.max(0.0001, finGeometry.boundingBox.max.y - finYMin);
  const finPosition = finGeometry.attributes.position;
  for (let i = 0; i < finPosition.count; i += 1) {
    const heightT = (finPosition.getY(i) - finYMin) / finYSpan;
    const taper = 1 - heightT * 0.68;
    finPosition.setZ(i, finPosition.getZ(i) * taper);
  }
  finGeometry.computeVertexNormals();
  const dorsalFin = new THREE.Mesh(finGeometry, deepBlue);
  dorsalFin.position.set(0, 0.425, -0.19);
  dorsalFin.rotation.y = Math.PI / 2;
  bodyGroup.add(dorsalFin);

  // 棒球帽：低帽身、深色帽箍、向前伸出并下弯的帽檐、前片校徽、帽顶扣
  const cap = new THREE.Group();
  cap.position.set(0, 0.325, 0.02);

  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(0.262, 36, 22, 0, Math.PI * 2, 0, Math.PI / 2),
    capBlue
  );
  crown.scale.set(1.02, 0.56, 1);
  cap.add(crown);

  const capBand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.268, 0.273, 0.045, 36, 1, true),
    capBandBlue
  );
  capBand.position.y = 0.006;
  cap.add(capBand);

  // 帽片拼缝：三条细滚边，让近景更像棒球帽而不是圆盔
  const crownHeight = 0.262 * 0.56;
  const seamRadius = 0.262 * 1.02;
  for (const azimuth of [-0.7, 0.7, Math.PI]) {
    const seamPoints = [];
    for (let i = 0; i <= 10; i += 1) {
      const theta = (i / 10) * (Math.PI / 2) * 0.98;
      seamPoints.push(new THREE.Vector3(
        Math.sin(theta) * seamRadius * 1.012 * Math.cos(azimuth),
        crownHeight * Math.cos(theta) + 0.003,
        Math.sin(theta) * seamRadius * 1.012 * Math.sin(azimuth)
      ));
    }
    const seam = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(seamPoints), 14, 0.0042, 5, false),
      new THREE.MeshStandardMaterial({ color: 0x1d6f9f, roughness: 0.85 })
    );
    cap.add(seam);
  }

  // 大帽檐：较深的蓝色、前伸 0.29，两侧与前沿再向下弯，正/侧视都能看出是球帽
  const brimShape = new THREE.Shape();
  brimShape.moveTo(-0.235, 0);
  brimShape.quadraticCurveTo(-0.252, 0.11, -0.17, 0.2);
  brimShape.quadraticCurveTo(-0.09, 0.285, 0, 0.29);
  brimShape.quadraticCurveTo(0.09, 0.285, 0.17, 0.2);
  brimShape.quadraticCurveTo(0.252, 0.11, 0.235, 0);
  brimShape.closePath();
  const brimGeometry = new THREE.ExtrudeGeometry(brimShape, {
    depth: 0.026,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.011,
    bevelThickness: 0.011,
    curveSegments: 14
  });
  const brimPositions = brimGeometry.attributes.position;
  for (let i = 0; i < brimPositions.count; i += 1) {
    const x = brimPositions.getX(i);
    const y = brimPositions.getY(i);
    // local +z 经旋转后朝下：加一点二次方弯曲，形成棒球帽檐的弧面
    brimPositions.setZ(i, brimPositions.getZ(i) + 0.55 * x * x + 0.16 * y * y);
  }
  brimGeometry.computeVertexNormals();
  const brim = new THREE.Mesh(brimGeometry, brimBlue);
  brim.position.set(0, 0.006, 0.075);
  brim.rotation.x = Math.PI / 2 + 0.17;
  cap.add(brim);

  const badge = new THREE.Mesh(
    new THREE.CircleGeometry(0.067, 32),
    new THREE.MeshStandardMaterial({
      map: badgeTexture(),
      transparent: true,
      alphaTest: 0.05,
      roughness: 0.72,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1
    })
  );
  badge.position.set(-0.05, 0.062, 0.247);
  badge.rotation.set(-0.2, -0.22, 0);
  cap.add(badge);

  const capButton = new THREE.Mesh(new THREE.SphereGeometry(0.019, 12, 8), capBlue);
  capButton.position.set(0, crownHeight + 0.002, 0);
  cap.add(capButton);

  bodyGroup.add(cap);

  /* ------------------------------ 爱心 ------------------------------ */
  const heartMap = heartTexture();
  const hearts = [];
  for (let i = 0; i < 3; i += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: heartMap,
      transparent: true,
      depthTest: false
    }));
    sprite.scale.setScalar(0.16);
    sprite.visible = false;
    sprite.raycast = () => {};
    group.add(sprite);
    hearts.push({ sprite, life: 0, x: 0, y: 0, phase: 0 });
  }

  return { group, bodyGroup, eyes, arms, tail, cap, hearts };
}

export function createPet({ camera, renderer, scene, reducedMotion = false, still = false } = {}) {
  const mascot = buildMascot();
  const group = mascot.group;
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

  /* --------------------------- 屏幕锚点 --------------------------- */
  const aspectOf = () => camera?.aspect || (typeof window !== 'undefined' ? window.innerWidth / Math.max(1, window.innerHeight) : 1);
  const isNarrow = () => aspectOf() < NARROW_ASPECT;
  const limitsOf = () => (isNarrow() ? NARROW_LIMITS : WIDE_LIMITS);

  function defaultAnchor() {
    const base = isNarrow() ? NARROW_ANCHOR : DEFAULT_ANCHOR;
    return { x: base.x, y: base.y };
  }

  function clampAnchor(x, y) {
    const limits = limitsOf();
    const fallback = defaultAnchor();
    const nx = Number(x);
    const ny = Number(y);
    return {
      x: Math.max(-limits.x, Math.min(limits.x, Number.isFinite(nx) ? nx : fallback.x)),
      y: Math.max(limits.yMin, Math.min(limits.yMax, Number.isFinite(ny) ? ny : fallback.y))
    };
  }

  function readAnchor() {
    if (still) return defaultAnchor();
    if (!storage) return defaultAnchor();
    try {
      const raw = storage.getItem(ANCHOR_KEY);
      if (!raw) return defaultAnchor();
      const parsed = JSON.parse(raw);
      if (!parsed || !Number.isFinite(Number(parsed.x)) || !Number.isFinite(Number(parsed.y))) {
        return defaultAnchor();
      }
      return clampAnchor(parsed.x, parsed.y);
    } catch {
      return defaultAnchor();
    }
  }

  let anchor = readAnchor();

  /* --------------------------- 360° 转台 --------------------------- */
  function readRotation() {
    if (still || !storage) return 0;
    try {
      const raw = storage.getItem(ROTATION_KEY);
      if (!raw) return 0;
      const parsed = Number(JSON.parse(raw)?.deg);
      if (!Number.isFinite(parsed)) return 0;
      return ((parsed % 360) + 360) % 360;
    } catch {
      return 0;
    }
  }

  let rotationDeg = readRotation();
  let spinState = null;

  function persistRotation() {
    if (!storage) return;
    try {
      storage.setItem(ROTATION_KEY, JSON.stringify({ deg: rotationDeg }));
    } catch {
      /* 忽略存储失败（隐私模式等） */
    }
  }

  function getRotation() {
    return Math.round(((rotationDeg % 360) + 360) % 360);
  }

  function setRotation(deg, { save: shouldSave = true } = {}) {
    const next = Number(deg);
    rotationDeg = ((Number.isFinite(next) ? next : 0) % 360 + 360) % 360;
    spinState = null;
    if (shouldSave) persistRotation();
    return getRotation();
  }

  function spin360() {
    if (disposed) return false;
    spinState = { from: rotationDeg, to: rotationDeg + 360, elapsed: 0, duration: 1.15 };
    return true;
  }

  function persistAnchor() {
    // ?still=1 只跳过「读取」存档以保持首帧确定性；显式 setAnchor 仍应落盘。
    if (!storage) return;
    try {
      storage.setItem(ANCHOR_KEY, JSON.stringify({ x: anchor.x, y: anchor.y }));
    } catch {
      /* 忽略存储失败（隐私模式等） */
    }
  }

  /** 视口比例变化时重新夹取锚点；位置变化才写盘。 */
  function syncAnchorToAspect() {
    const next = clampAnchor(anchor.x, anchor.y);
    if (next.x !== anchor.x || next.y !== anchor.y) {
      anchor.x = next.x;
      anchor.y = next.y;
      persistAnchor();
    }
  }

  /* ----------------------------- 状态机 ----------------------------- */
  const random = mulberry32(20261112);
  const baseState = {
    hunger: 78,
    energy: 72,
    affection: 46,
    sleeping: false,
    // 默认不启用：用户点 dock「海海」后才出现；之后尊重本机存档。
    visible: false,
    engaged: false,
    lastSeen: Date.now()
  };

  function readState() {
    if (still || !storage) return { ...baseState, lastSeen: Date.now() };
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return { ...baseState, lastSeen: Date.now() };
      const parsed = JSON.parse(raw);
      // 旧存档没有 engaged 字段：按「未启用」迁移，避免升级后宠物仍默认出现。
      const hasEngagement = Object.prototype.hasOwnProperty.call(parsed, 'engaged');
      return {
        hunger: clamp01(Number(parsed.hunger) || baseState.hunger),
        energy: clamp01(Number(parsed.energy) || baseState.energy),
        affection: clamp01(Number(parsed.affection) || baseState.affection),
        sleeping: Boolean(parsed.sleeping),
        visible: hasEngagement && parsed.visible === true,
        engaged: hasEngagement && (Boolean(parsed.engaged) || parsed.visible === true),
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
        engaged: state.engaged,
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
  group.visible = state.visible;
  let disposed = false;
  let dragging = false;

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
    if (state.visible) state.engaged = true;
    group.visible = state.visible && !suppressed;
    save();
    return state.visible;
  }

  function setSuppressed(next) {
    suppressed = Boolean(next);
    group.visible = state.visible && !suppressed;
  }

  function reset() {
    Object.assign(state, { ...baseState, visible: false, engaged: false, lastSeen: Date.now() });
    group.visible = false;
    rotationDeg = 0;
    spinState = null;
    persistRotation();
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

  /**
   * 把宠物放到相机前方固定距离，按归一化屏幕锚点偏移；始终面朝相机。
   * 缩放按当前 halfH 计算，让宠物在不同 FOV/视口下保持相近的屏幕占比。
   */
  function place() {
    if (!camera || disposed) return;
    syncAnchorToAspect();
    const distance = PET_DISTANCE;
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance;
    const halfW = halfH * aspectOf();
    tmpVec.set(halfW * anchor.x, halfH * anchor.y, -distance).applyQuaternion(camera.quaternion);
    group.position.copy(camera.position).add(tmpVec);
    group.quaternion.copy(camera.quaternion);
    group.scale.setScalar(PET_SCALE * halfH);
  }

  function getAnchor() {
    return { x: anchor.x, y: anchor.y };
  }

  function setAnchor(x, y, { save: shouldSave = true } = {}) {
    const next = clampAnchor(x, y);
    anchor.x = next.x;
    anchor.y = next.y;
    if (shouldSave) persistAnchor();
    place();
    return { x: anchor.x, y: anchor.y };
  }

  function resetAnchor() {
    const next = defaultAnchor();
    anchor.x = next.x;
    anchor.y = next.y;
    persistAnchor();
    place();
    return { x: anchor.x, y: anchor.y };
  }

  function setDragging(next) {
    dragging = Boolean(next);
    if (dragging) bounce = 0;
    return dragging;
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

    if (spinState) {
      spinState.elapsed += delta;
      const t = Math.min(1, spinState.elapsed / spinState.duration);
      const eased = 1 - (1 - t) ** 3;
      rotationDeg = spinState.from + (spinState.to - spinState.from) * eased;
      if (t >= 1) {
        rotationDeg = ((spinState.to % 360) + 360) % 360;
        spinState = null;
        persistRotation();
      }
    }

    // 呼吸 / 漂浮；拖动时定格为稳定站姿，避免跟随鼠标时晃眼
    const mood = moodOf();
    const rate = mood === MOODS.sleeping ? 0.6 : mood === MOODS.happy ? 3.2 : 2.0;
    const bob = Math.sin(time * rate) * (mood === MOODS.sleeping ? 0.006 : 0.016);
    const idleYaw = Math.sin(time * 0.6) * 0.11;
    const idleRoll = Math.sin(time * 1.1) * 0.032;
    // 基础朝向略带 3/4，让帽檐、腮红线和书包侧面在正面视角也能读出来
    const baseYaw = 0.16 + THREE.MathUtils.degToRad(rotationDeg);
    if (dragging) {
      mascot.bodyGroup.position.y = 0.002;
      mascot.bodyGroup.rotation.y = baseYaw;
      mascot.bodyGroup.rotation.z = 0;
    } else {
      mascot.bodyGroup.position.y = bob;
      mascot.bodyGroup.rotation.y = baseYaw + idleYaw;
      mascot.bodyGroup.rotation.z = idleRoll;
    }

    // 抬手的小手在开心时轻轻挥动；拖着宠物时保持稳定
    mascot.arms.forEach((arm, index) => {
      const base = arm.userData.baseZ;
      const side = arm.userData.side;
      if (dragging) {
        arm.rotation.z = base;
      } else {
        const wave = Math.sin(time * (mood === MOODS.happy ? 6.4 : 2.6) + index * 1.7);
        arm.rotation.z = base + (side < 0 ? wave * 0.09 : wave * 0.035);
      }
    });

    // 小尾鳍与帽子的轻微跟随
    mascot.tail.rotation.z = dragging ? 0 : Math.sin(time * 3.2) * 0.08;
    mascot.cap.rotation.z = dragging ? 0 : Math.sin(time * 0.9) * 0.022;

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
    mascot.eyes.forEach((eye) => {
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
    mascot.hearts.forEach((heart, index) => {
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
      engaged: state.engaged,
      mood: { ...mood },
      cooldowns: { pet: cooldowns.pet, feed: cooldowns.feed },
      anchor: { x: anchor.x, y: anchor.y },
      rotation: getRotation(),
      dragging
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.remove(group);
    const textures = new Set();
    group.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          for (const key of ['map', 'bumpMap', 'roughnessMap', 'normalMap', 'emissiveMap']) {
            if (material[key]) textures.add(material[key]);
          }
          material.dispose();
        }
      }
    });
    textures.forEach((texture) => texture.dispose());
    if (audioCtx) {
      try { audioCtx.close(); } catch { /* noop */ }
      audioCtx = null;
    }
  }

  function onPageHide() {
    save();
    persistAnchor();
    persistRotation();
  }
  if (typeof window !== 'undefined' && !still) {
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('visibilitychange', () => {
      if (document.hidden) save();
    });
  }

  // 初始化位置：不依赖首帧 update
  place();

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
    dispose,
    getAnchor,
    setAnchor,
    resetAnchor,
    getRotation,
    setRotation,
    spin360,
    setDragging
  };
}
