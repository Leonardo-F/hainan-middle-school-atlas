/**
 * 天气系统（视觉层）
 * ---------------------------------------------------------------------------
 * 校园图志的可切换天气引擎：晴 / 小雨 / 暴雨 / 台风 / 雷雨 / 下雪（含地面积雪）。
 *
 * 设计原则
 * - 非侵入：只读写 scene.fog、renderer.toneMappingExposure 与天空 shader 的
 *   uTop/uHorizon uniform，并在单独的天气根节点上挂粒子 / 积雪 / 闪电；
 *   不修改 campus / world 里任何已有几何、材质与灯光。
 * - 可恢复：createWeather 时记录 fog / 曝光 / 天空的“基线”，每次 tick 都从
 *   基线重新计算（而不是把天气系数累加进 campus.setTime 的结果），
 *   setWeather('clear') 与 dispose() 会把场景精确恢复原样。
 * - 平滑：所有参数用指数缓动过渡（约 1–2 s），粒子数量用 drawRange 渐变，
 *   地面积雪单独用更慢的缓动（2–4 s）渐入。
 * - 性能：雨 = 单个 LineSegments + 自定义 shader 做时间驱动（CPU 每帧只更新
 *   uniform，不遍历顶点）；雪 = 单个 Points + shader；贴图全部 Canvas 生成。
 *   粒子数量按设备宽度 / 指针类型自适应（移动端约为桌面端的 52%）。
 *
 * 对外 API（weather-ui 按此集成，勿改名）
 * ---------------------------------------------------------------------------
 *   import { WEATHERS, createWeather } from './weather.js';
 *   const weather = createWeather({ scene, renderer, camera, controls, site: SITE, world: campus.world });
 *   weather.setWeather(id);   // 立即切换当前 id（视觉 1–2 s 过渡）；未知 id 回退 'clear'
 *   weather.getWeather();     // 当前 id
 *   weather.setHour(hour);    // main.js 在 campus.setTime(hour) 之后调用，同步昼/夜基线
 *   weather.tick(delta);      // 每帧调用（应在 campus.tick 之后、renderer.render 之前）
 *   weather.dispose();        // 移除天气对象并恢复 fog / 曝光 / 天空；可重复调用
 *
 * 集成顺序建议（main.js）：
 *   applyHour(hour): campus.setTime(hour); weather?.setHour(hour);
 *   renderFrame(delta): campus.tick(delta); weather?.tick(delta); ... renderer.render(...)
 *
 * 数据依赖：site.campusOutline（Polygon [[x,z],...]，场景单位；1 单位 ≈ 2 m）。
 * 无外部资源、无新增依赖。
 */

import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;

/* ------------------------------------------------------------------ */
/*  Public weather list（顺序 = UI 滑杆顺序，勿改 id）                  */
/* ------------------------------------------------------------------ */

export const WEATHERS = [
  { id: 'clear', name: '晴', en: 'CLEAR' },
  { id: 'light-rain', name: '小雨', en: 'LIGHT RAIN' },
  { id: 'heavy-rain', name: '暴雨', en: 'HEAVY RAIN' },
  { id: 'typhoon', name: '台风', en: 'TYPHOON' },
  { id: 'thunder', name: '雷雨', en: 'THUNDER' },
  { id: 'snow', name: '下雪', en: 'SNOW' },
];

const WEATHER_IDS = new Set(WEATHERS.map((w) => w.id));

/* ------------------------------------------------------------------ */
/*  Tuning                                                             */
/* ------------------------------------------------------------------ */

// 桌面端粒子上限；移动端按 countScale 缩减。
const RAIN_MAX_DESKTOP = 7000;
const SNOW_MAX_DESKTOP = 3400;

// 粒子跟随相机的包围盒（半长，场景单位）。雨盒略高，雪盒略矮。
const RAIN_BOX = new THREE.Vector3(30, 26, 30);
const SNOW_BOX = new THREE.Vector3(26, 20, 26);
// 盒心沿相机视线前移：大部分粒子落在视野里，密度感受更接近真实雨雪。
const RAIN_FORWARD = 20;
const SNOW_FORWARD = 10;
const RAIN_Y_OFFSET = 3;
const SNOW_Y_OFFSET = 2;

const RAIN_COLOR = new THREE.Color('#6f7e80'); // 冷灰雨丝，落在暖纸底上仍可辨
const SNOW_COLOR = new THREE.Color('#f7fbff');
const WHITE = new THREE.Color('#ffffff');

// 各天气的目标参数（运行时缓动逼近这些值）。
// count：桌面端粒子数；exposure：相对基线曝光倍率；
// fogNear/fogFar：相对基线雾距的倍率；fogBlend / skyBlend：向天气色/天空色混合比例。
const PRESETS = {
  clear: {
    rain: { count: 0, opacity: 0, speed: 15, streak: 0.32, windX: 0, windZ: 0 },
    snow: { count: 0, opacity: 0, speed: 2.6 },
    groundSnow: 0,
    groundWet: 0,
    exposure: 1,
    fogColor: '#d9dcd3',
    fogBlend: 0,
    fogNear: 1,
    fogFar: 1,
    skyTop: '#9daaa7',
    skyHorizon: '#e6ddca',
    skyBlend: 0,
    lightning: false,
  },
  'light-rain': {
    rain: { count: 1400, opacity: 0.4, speed: 16, streak: 0.38, windX: 1.1, windZ: 0.5 },
    snow: { count: 0, opacity: 0, speed: 2.6 },
    groundSnow: 0,
    groundWet: 0.05,
    exposure: 0.99,
    fogColor: '#c3cac5',
    fogBlend: 0.5,
    fogNear: 0.78,
    fogFar: 0.84,
    skyTop: '#93a0a0',
    skyHorizon: '#d2d6ce',
    skyBlend: 0.45,
    lightning: false,
  },
  'heavy-rain': {
    rain: { count: 5000, opacity: 0.6, speed: 28, streak: 0.72, windX: 3.0, windZ: 1.2 },
    snow: { count: 0, opacity: 0, speed: 2.6 },
    groundSnow: 0,
    groundWet: 0.12,
    exposure: 0.86,
    fogColor: '#aeb6b0',
    fogBlend: 0.66,
    fogNear: 0.6,
    fogFar: 0.66,
    skyTop: '#78837f',
    skyHorizon: '#b9c2bb',
    skyBlend: 0.72,
    lightning: false,
  },
  typhoon: {
    // 雨速 30、水平风 (16, 6) → 雨丝倾角约 28°，落在需求 25–35° 区间
    rain: { count: 6500, opacity: 0.68, speed: 30, streak: 1.0, windX: 16, windZ: 6 },
    snow: { count: 0, opacity: 0, speed: 2.6 },
    groundSnow: 0,
    groundWet: 0.16,
    exposure: 0.78,
    fogColor: '#9aa39e',
    fogBlend: 0.78,
    fogNear: 0.45,
    fogFar: 0.52,
    skyTop: '#55605f',
    skyHorizon: '#9aa4a0',
    skyBlend: 0.85,
    lightning: false,
  },
  thunder: {
    rain: { count: 5200, opacity: 0.6, speed: 28, streak: 0.75, windX: 5.5, windZ: 2.0 },
    snow: { count: 0, opacity: 0, speed: 2.6 },
    groundSnow: 0,
    groundWet: 0.13,
    exposure: 0.84,
    fogColor: '#96a09c',
    fogBlend: 0.74,
    fogNear: 0.52,
    fogFar: 0.58,
    skyTop: '#4e595c',
    skyHorizon: '#98a29e',
    skyBlend: 0.8,
    lightning: true,
  },
  snow: {
    rain: { count: 0, opacity: 0, speed: 15, streak: 0.32, windX: 0, windZ: 0 },
    snow: { count: 3400, opacity: 1, speed: 2.6 },
    groundSnow: 1,
    groundWet: 0,
    exposure: 1.12,
    fogColor: '#e3e9ea',
    fogBlend: 0.78,
    fogNear: 0.52,
    fogFar: 0.58,
    skyTop: '#a2b5be',
    skyHorizon: '#cfdade',
    skyBlend: 0.85,
    lightning: false,
  },
};

/* ------------------------------------------------------------------ */
/*  Small helpers                                                      */
/* ------------------------------------------------------------------ */

/** 指数缓动：返回从 current 朝 target 前进（1 - e^(-λ·dt)）后的值。 */
function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function makeCanvas(size, draw) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** 雪花贴图：柔光圆点 + 极淡的六角晶枝，避免“廉价大圆盘”。 */
function makeSnowflakeTexture() {
  return makeCanvas(64, (g, s) => {
    const c = s / 2;
    const glow = g.createRadialGradient(c, c, 0, c, c, c);
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(0.3, 'rgba(255,255,255,0.92)');
    glow.addColorStop(0.62, 'rgba(255,255,255,0.34)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(c, c, c - 1, 0, TAU);
    g.fill();

    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 1.6;
    g.lineCap = 'round';
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * TAU + Math.PI / 6;
      const x = c + Math.cos(a) * (c - 6);
      const y = c + Math.sin(a) * (c - 6);
      g.beginPath();
      g.moveTo(c, c);
      g.lineTo(x, y);
      g.stroke();
      // 晶枝
      const bx = c + Math.cos(a) * (c - 15);
      const by = c + Math.sin(a) * (c - 15);
      for (const side of [-0.62, 0.62]) {
        g.beginPath();
        g.moveTo(bx, by);
        g.lineTo(bx + Math.cos(a + side) * 7, by + Math.sin(a + side) * 7);
        g.stroke();
      }
    }
  });
}

/** 地面积雪用的极低对比噪声贴图，避免大面积纯白显得“平”。 */
function makeSnowNoiseTexture() {
  const t = makeCanvas(128, (g, s) => {
    g.fillStyle = '#f4f7f6';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 420; i += 1) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const r = 1 + Math.random() * 4;
      g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(214,223,222,0.10)';
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.055, 0.055);
  return t;
}

/* ------------------------------------------------------------------ */
/*  Shaders                                                            */
/* ------------------------------------------------------------------ */

const RAIN_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCenter;
  uniform vec3 uBox;
  uniform vec3 uVel;
  uniform float uStreak;
  uniform float uOpacity;

  attribute float aRand;
  attribute float aTip;

  varying float vAlpha;

  void main() {
    // 每个粒子从固定种子出发，沿速度方向循环平移；CPU 不更新顶点。
    vec3 moved = position + uVel * uTime;
    vec3 rel = mod(moved - uCenter + uBox, 2.0 * uBox) - uBox;
    vec3 head = uCenter + rel;

    // 雨丝沿速度方向拉长：尾部在运动反方向，风斜角由此自然产生。
    vec3 dir = normalize(uVel);
    vec3 pos = head - dir * (uStreak * aTip);

    float dist = length(head - cameraPosition);
    float nearFade = smoothstep(0.7, 3.0, dist);
    float radial = length(head.xz - uCenter.xz);
    float edgeFade = 1.0 - smoothstep(uBox.x * 0.8, uBox.x * 1.15, radial);

    vAlpha = uOpacity * nearFade * edgeFade * (0.45 + aRand * 0.85);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const RAIN_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;

  void main() {
    if (vAlpha < 0.003) discard;
    gl_FragColor = vec4(uColor, vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const SNOW_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCenter;
  uniform vec3 uBox;
  uniform float uFall;
  uniform float uOpacity;
  uniform vec2 uDrift;
  uniform float uSizeScale;
  uniform float uPixelRatio;

  attribute float aPhase;
  attribute float aSize;
  attribute float aRand;

  varying float vAlpha;

  void main() {
    // 缓慢下落 + 双频横向摆动（“安静”的雪，不是直线砸下来）。
    float sway = sin(uTime * 0.62 + aPhase) * 0.9 + sin(uTime * 0.27 + aPhase * 1.7) * 0.45;
    float drift = cos(uTime * 0.43 + aPhase * 1.3) * 0.7;
    vec3 moved = position + vec3(sway + uDrift.x * uTime, -uFall * uTime, drift + uDrift.y * uTime);
    vec3 rel = mod(moved - uCenter + uBox, 2.0 * uBox) - uBox;
    vec3 world = uCenter + rel;

    float dist = length(world - cameraPosition);
    float nearFade = smoothstep(0.8, 4.0, dist);
    float radial = length(world.xz - uCenter.xz);
    float edgeFade = 1.0 - smoothstep(uBox.x * 0.8, uBox.x * 1.15, radial);

    vAlpha = uOpacity * nearFade * edgeFade * (0.55 + aRand * 0.55);

    vec4 mv = modelViewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(aSize * uSizeScale * uPixelRatio / max(1.0, -mv.z), 1.0, 16.0);
  }
`;

const SNOW_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  varying float vAlpha;

  void main() {
    float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------ */
/*  Factory                                                            */
/* ------------------------------------------------------------------ */

/**
 * @param {object} options
 * @param {THREE.Scene} options.scene
 * @param {THREE.WebGLRenderer} [options.renderer]
 * @param {THREE.PerspectiveCamera} options.camera
 * @param {object} [options.controls] 目前不直接使用，保留给未来的相机抖动
 * @param {object} [options.site] 需要 site.campusOutline
 * @param {THREE.Object3D} [options.world] 校园根节点（用于找天空 shader 的 uniform）
 */
export function createWeather({ scene, renderer, camera, controls, site, world } = {}) {
  let disposed = false;
  let currentId = 'clear';
  let simTime = 0;   // 粒子运动时间（按渲染 dt 推进，低帧率下是慢动作而不是跳帧）
  let uiTime = 0;    // 过渡 / 闪电计时（按真实墙钟推进，任何帧率下体感一致）
  let lastWallTime = 0;
  let hour = 16.3;
  let flash = 0;

  // 设备自适应（低性能设备 / 移动端减少粒子）
  const coarsePointer =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)').matches ||
      Math.min(window.innerWidth, window.innerHeight) < 700);
  const countScale = coarsePointer ? 0.52 : 1;
  const rainMax = Math.max(600, Math.ceil(RAIN_MAX_DESKTOP * countScale));
  const snowMax = Math.max(500, Math.ceil(SNOW_MAX_DESKTOP * countScale));

  /* ---------------- 基线：fog / 曝光 / 天空 ---------------- */
  const baseExposure =
    renderer && typeof renderer.toneMappingExposure === 'number'
      ? renderer.toneMappingExposure
      : 1;

  let skyUniforms = null;
  const baseSkyTop = new THREE.Color();
  const baseSkyHorizon = new THREE.Color();
  let hasSkyBase = false;

  let baseFogRef = null; // campus.setTime 每次都会 new THREE.Fog(...)，用引用变化识别新基线
  const baseFogColor = new THREE.Color(0xe6dac4);
  let baseFogNear = 650;
  let baseFogFar = 1700;
  let hasFogBase = false;

  const _fogTarget = new THREE.Color();
  const _skyTop = new THREE.Color();
  const _skyHorizon = new THREE.Color();
  const _rainColor = new THREE.Color();
  const _presetFog = new THREE.Color();
  const _presetSkyTop = new THREE.Color();
  const _presetSkyHorizon = new THREE.Color();

  /* ---------------- 运行时状态（全部指数缓动） ---------------- */
  const cur = {
    rainCount: 0,
    rainOpacity: 0,
    rainSpeed: 15,
    rainStreak: 0.3,
    windX: 0,
    windZ: 0,
    snowCount: 0,
    snowOpacity: 0,
    snowSpeed: 3,
    groundSnow: 0,
    groundWet: 0,
    exposure: 1,
    fogBlend: 0,
    fogNear: 1,
    fogFar: 1,
    skyBlend: 0,
  };

  /* ---------------- 雷雨闪电状态 ---------------- */
  const lightning = { nextAt: 0, strikeAt: -1e6 };

  /* ------------------------------------------------------------------ */
  /*  Object graph                                                       */
  /* ------------------------------------------------------------------ */

  let root = null;
  let rainMesh = null;
  let rainMat = null;
  let rainGeo = null;
  let snowMesh = null;
  let snowMat = null;
  let snowGeo = null;
  let snowTexture = null;
  let snowNoiseTexture = null;
  let snowGround = null;
  let snowGroundMat = null;
  let wetGround = null;
  let wetGroundMat = null;
  let groundGeo = null;
  let flashLight = null;

  const hasScene = Boolean(scene && camera);

  if (hasScene) {
    root = new THREE.Group();
    root.name = 'weather';
    root.matrixAutoUpdate = true;
    scene.add(root);

    /* ---------------- 雨丝：单个 LineSegments ---------------- */
    {
      const segs = rainMax;
      const positions = new Float32Array(segs * 2 * 3);
      const rands = new Float32Array(segs * 2);
      const tips = new Float32Array(segs * 2);
      for (let i = 0; i < segs; i += 1) {
        const x = (Math.random() - 0.5) * 2 * RAIN_BOX.x;
        const y = (Math.random() - 0.5) * 2 * RAIN_BOX.y;
        const z = (Math.random() - 0.5) * 2 * RAIN_BOX.z;
        const rand = Math.random();
        for (let v = 0; v < 2; v += 1) {
          const o = (i * 2 + v) * 3;
          positions[o] = x;
          positions[o + 1] = y;
          positions[o + 2] = z;
          rands[i * 2 + v] = rand;
          tips[i * 2 + v] = v;
        }
      }
      rainGeo = new THREE.BufferGeometry();
      rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      rainGeo.setAttribute('aRand', new THREE.BufferAttribute(rands, 1));
      rainGeo.setAttribute('aTip', new THREE.BufferAttribute(tips, 1));
      rainGeo.setDrawRange(0, 0);

      rainMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uCenter: { value: new THREE.Vector3() },
          uBox: { value: RAIN_BOX.clone() },
          uVel: { value: new THREE.Vector3(0, -15, 0) },
          uStreak: { value: 0.3 },
          uOpacity: { value: 0 },
          uColor: { value: RAIN_COLOR.clone() },
        },
        vertexShader: RAIN_VERTEX,
        fragmentShader: RAIN_FRAGMENT,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.NormalBlending,
        toneMapped: true,
      });
      rainMesh = new THREE.LineSegments(rainGeo, rainMat);
      rainMesh.name = 'weather-rain';
      rainMesh.frustumCulled = false;
      rainMesh.renderOrder = 6;
      rainMesh.visible = false;
      root.add(rainMesh);
    }

    /* ---------------- 雪花：单个 Points ---------------- */
    {
      const count = snowMax;
      const positions = new Float32Array(count * 3);
      const phases = new Float32Array(count);
      const sizes = new Float32Array(count);
      const rands = new Float32Array(count);
      for (let i = 0; i < count; i += 1) {
        positions[i * 3] = (Math.random() - 0.5) * 2 * SNOW_BOX.x;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 2 * SNOW_BOX.y;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 2 * SNOW_BOX.z;
        phases[i] = Math.random() * TAU;
        sizes[i] = 0.6 + Math.random() * 0.85;
        rands[i] = Math.random();
      }
      snowGeo = new THREE.BufferGeometry();
      snowGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      snowGeo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
      snowGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
      snowGeo.setAttribute('aRand', new THREE.BufferAttribute(rands, 1));
      snowGeo.setDrawRange(0, 0);

      snowTexture = makeSnowflakeTexture();
      snowMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uCenter: { value: new THREE.Vector3() },
          uBox: { value: SNOW_BOX.clone() },
          uFall: { value: 2.6 },
          uOpacity: { value: 0 },
          uDrift: { value: new THREE.Vector2(0.9, 0.35) },
          uSizeScale: { value: 125 },
          uPixelRatio: { value: 1 },
          uMap: { value: snowTexture },
          uColor: { value: SNOW_COLOR.clone() },
        },
        vertexShader: SNOW_VERTEX,
        fragmentShader: SNOW_FRAGMENT,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.NormalBlending,
        toneMapped: true,
      });
      snowMesh = new THREE.Points(snowGeo, snowMat);
      snowMesh.name = 'weather-snow';
      snowMesh.frustumCulled = false;
      snowMesh.renderOrder = 6;
      snowMesh.visible = false;
      root.add(snowMesh);
    }

    /* ---------------- 地面积雪 / 湿地面：campusOutline 形状 ---------------- */
    const outline = site && Array.isArray(site.campusOutline) ? site.campusOutline : null;
    if (outline && outline.length >= 3) {
      const shape = new THREE.Shape();
      outline.forEach(([x, z], i) => {
        // Shape 建在 XY 平面，绕 X 轴 -90° 后 (x, -z) → 世界 (x, 0, z)
        if (i === 0) shape.moveTo(x, -z);
        else shape.lineTo(x, -z);
      });
      shape.closePath();
      groundGeo = new THREE.ShapeGeometry(shape, 4);
      groundGeo.rotateX(-Math.PI / 2);

      snowNoiseTexture = makeSnowNoiseTexture();
      snowGroundMat = new THREE.MeshStandardMaterial({
        color: 0xf3f6f5,
        map: snowNoiseTexture,
        roughness: 0.94,
        metalness: 0,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.FrontSide,
      });
      snowGround = new THREE.Mesh(groundGeo, snowGroundMat);
      snowGround.name = 'weather-snow-ground';
      snowGround.position.y = 0.12; // 略高于草坪/跑道/道路，形成薄雪毯
      snowGround.receiveShadow = true;
      snowGround.castShadow = false;
      snowGround.frustumCulled = false;
      snowGround.renderOrder = 2;
      snowGround.visible = false;
      root.add(snowGround);

      wetGroundMat = new THREE.MeshStandardMaterial({
        color: 0x74807d,
        roughness: 0.42,
        metalness: 0.06,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.FrontSide,
      });
      wetGround = new THREE.Mesh(groundGeo, wetGroundMat);
      wetGround.name = 'weather-wet-ground';
      wetGround.position.y = 0.11;
      wetGround.receiveShadow = true;
      wetGround.castShadow = false;
      wetGround.frustumCulled = false;
      wetGround.renderOrder = 2;
      wetGround.visible = false;
      root.add(wetGround);
    }

    /* ---------------- 闪电：无阴影平行光 ---------------- */
    flashLight = new THREE.DirectionalLight(0xdde8ff, 0);
    flashLight.name = 'weather-lightning';
    flashLight.position.set(160, 280, 120);
    flashLight.castShadow = false;
    root.add(flashLight);
    const flashTarget = new THREE.Object3D();
    flashTarget.position.set(0, 0, 0);
    root.add(flashTarget);
    flashLight.target = flashTarget;
  }

  /* ------------------------------------------------------------------ */
  /*  Baseline sync                                                      */
  /* ------------------------------------------------------------------ */

  function findSkyUniforms() {
    if (skyUniforms || !world) return;
    world.traverse((obj) => {
      if (skyUniforms || !obj.isMesh || !obj.material) return;
      const u = obj.material.uniforms;
      if (u && u.uTop && u.uHorizon && u.uNight) skyUniforms = u;
    });
  }

  /** 每秒粒度同步：campus.setTime 之后调用，重新记录“无天气”的基线。 */
  function syncBaseline(forceSky) {
    findSkyUniforms();
    if (scene && scene.fog && scene.fog !== baseFogRef) {
      baseFogRef = scene.fog;
      baseFogColor.copy(scene.fog.color);
      baseFogNear = scene.fog.near;
      baseFogFar = scene.fog.far;
      hasFogBase = true;
    }
    if (skyUniforms && (!hasSkyBase || forceSky)) {
      baseSkyTop.copy(skyUniforms.uTop.value);
      baseSkyHorizon.copy(skyUniforms.uHorizon.value);
      hasSkyBase = true;
    }
  }

  function setHour(nextHour) {
    if (disposed) return;
    if (Number.isFinite(nextHour)) hour = clamp(nextHour, 0, 24);
    // campus.setTime 刚重建过 fog / 天空 uniform，此时读到的就是干净基线。
    syncBaseline(true);
  }

  /* ------------------------------------------------------------------ */
  /*  Lightning                                                          */
  /* ------------------------------------------------------------------ */

  function flashCurve(x) {
    // 主闪 + 两次回闪，时间常数均为秒；0.9 s 内衰减到几乎 0。
    let v = Math.exp(-x * 26);
    if (x > 0.09) v = Math.max(v, Math.exp(-(x - 0.09) * 34) * 0.8);
    if (x > 0.38) v = Math.max(v, Math.exp(-(x - 0.38) * 11) * 0.9);
    if (x > 0.55) v = Math.max(v, Math.exp(-(x - 0.55) * 8) * 0.3);
    return Math.min(1.15, v);
  }

  function updateLightning() {
    const preset = PRESETS[currentId];
    const stormy = Boolean(preset.lightning) && cur.rainOpacity > 0.18;
    if (!stormy) {
      lightning.nextAt = 0;
      lightning.strikeAt = -1e6;
      flash = 0;
      return;
    }
    if (lightning.nextAt === 0) {
      // 进入雷雨后 1.2–3.4 s 内给一次闪电，之后按 6–14 s 随机间隔。
      lightning.nextAt = uiTime + 1.2 + Math.random() * 2.2;
    }
    if (uiTime >= lightning.nextAt) {
      lightning.strikeAt = uiTime;
      lightning.nextAt = uiTime + 6 + Math.random() * 8;
    }
    const x = uiTime - lightning.strikeAt;
    flash = x >= 0 && x < 1.4 ? flashCurve(x) : 0;
  }

  /* ------------------------------------------------------------------ */
  /*  Per-frame update                                                   */
  /* ------------------------------------------------------------------ */

  function applyAtmosphere() {
    // ---- 雾：都从基线出发重新混合，绝不累积 ----
    if (scene && scene.fog && hasFogBase) {
      const fog = scene.fog;
      if (cur.fogBlend > 0.0005) {
        _presetFog.set(PRESETS[currentId].fogColor);
        _fogTarget.copy(baseFogColor).lerp(_presetFog, cur.fogBlend);
        fog.color.copy(_fogTarget);
      } else {
        fog.color.copy(baseFogColor);
      }
      fog.near = baseFogNear * cur.fogNear;
      fog.far = baseFogFar * cur.fogFar;
    }

    // ---- 曝光：基线 × 天气倍率 × 闪电 ----
    if (renderer && typeof renderer.toneMappingExposure === 'number') {
      renderer.toneMappingExposure = baseExposure * cur.exposure * (1 + flash * 0.55);
    }

    // ---- 天空：从基线颜色混向天气色，闪电瞬间泛白 ----
    if (skyUniforms && hasSkyBase) {
      if (cur.skyBlend > 0.0005) {
        _presetSkyTop.set(PRESETS[currentId].skyTop);
        _presetSkyHorizon.set(PRESETS[currentId].skyHorizon);
        _skyTop.copy(baseSkyTop).lerp(_presetSkyTop, cur.skyBlend);
        _skyHorizon.copy(baseSkyHorizon).lerp(_presetSkyHorizon, cur.skyBlend);
      } else {
        _skyTop.copy(baseSkyTop);
        _skyHorizon.copy(baseSkyHorizon);
      }
      if (flash > 0.002) {
        _skyTop.lerp(WHITE, flash * 0.38);
        _skyHorizon.lerp(WHITE, flash * 0.3);
      }
      skyUniforms.uTop.value.copy(_skyTop);
      skyUniforms.uHorizon.value.copy(_skyHorizon);
    }

    // ---- 闪电补光 ----
    if (flashLight) {
      flashLight.intensity = flash * 2.8;
      flashLight.visible = flash > 0.001;
    }
  }

  function tick(delta) {
    if (disposed || !hasScene) return;
    const dt = Number.isFinite(delta) ? clamp(delta, 0, 0.05) : 0.016;
    // main.js 会把 delta 钳到 0.055 s；在低帧率设备 / 无 GPU 的截图环境里，
    // 若天气过渡只按 dt 推进，2–4 s 的积雪渐入会变成几十秒的慢动作。
    // 过渡与闪电计时改用"真实墙钟（封顶 0.25 s）与 dt 的较大值"，粒子运动仍用 dt。
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    let wallDt = lastWallTime > 0 ? (now - lastWallTime) / 1000 : dt;
    lastWallTime = now;
    wallDt = Number.isFinite(wallDt) ? clamp(wallDt, 0, 0.25) : dt;
    const tdt = Math.max(dt, wallDt);
    simTime += dt;
    uiTime += tdt;

    syncBaseline(false);
    updateLightning();

    const preset = PRESETS[currentId];

    // ---- 粒子 / 积雪参数缓动 ----
    cur.rainCount = damp(cur.rainCount, preset.rain.count * countScale, 2.8, tdt);
    cur.rainOpacity = damp(cur.rainOpacity, preset.rain.opacity, 2.6, tdt);
    cur.rainSpeed = damp(cur.rainSpeed, preset.rain.speed, 2.0, tdt);
    cur.rainStreak = damp(cur.rainStreak, preset.rain.streak, 2.0, tdt);
    cur.windX = damp(cur.windX, preset.rain.windX, 2.0, tdt);
    cur.windZ = damp(cur.windZ, preset.rain.windZ, 2.0, tdt);

    cur.snowCount = damp(cur.snowCount, preset.snow.count * countScale, 2.6, tdt);
    cur.snowOpacity = damp(cur.snowOpacity, preset.snow.opacity, 2.4, tdt);
    cur.snowSpeed = damp(cur.snowSpeed, preset.snow.speed, 1.8, tdt);

    // 积雪：渐入慢（2–4 s 积起来），融化快（雪停后 1–2 s 退去）
    {
      const target = preset.groundSnow;
      // 渐入约 2.6 s 达到 95%（需求 2–4 s）；融化更快，雪停后 1–2 s 退去。
      const lambda = target > cur.groundSnow ? 1.15 : 1.8;
      cur.groundSnow = damp(cur.groundSnow, target, lambda, tdt);
    }
    cur.groundWet = damp(cur.groundWet, preset.groundWet, 2.2, tdt);

    // ---- 大气参数缓动 ----
    cur.exposure = damp(cur.exposure, preset.exposure, 2.2, tdt);
    cur.fogBlend = damp(cur.fogBlend, preset.fogBlend, 2.0, tdt);
    cur.fogNear = damp(cur.fogNear, preset.fogNear, 1.9, tdt);
    cur.fogFar = damp(cur.fogFar, preset.fogFar, 1.9, tdt);
    cur.skyBlend = damp(cur.skyBlend, preset.skyBlend, 1.8, tdt);

    // 回到晴天时收敛到“精确基线”，保证 clear 不改动场景
    if (currentId === 'clear') {
      if (cur.rainOpacity < 0.004) {
        cur.rainOpacity = 0;
        cur.rainCount = 0;
        cur.rainSpeed = 15;
        cur.rainStreak = 0.3;
        cur.windX = 0;
        cur.windZ = 0;
      }
      if (cur.snowOpacity < 0.004) {
        cur.snowOpacity = 0;
        cur.snowCount = 0;
        cur.snowSpeed = 3;
      }
      if (cur.groundSnow < 0.004) cur.groundSnow = 0;
      if (cur.groundWet < 0.004) cur.groundWet = 0;
      if (Math.abs(cur.exposure - 1) < 0.002) cur.exposure = 1;
      if (Math.abs(cur.fogBlend) < 0.004) cur.fogBlend = 0;
      if (Math.abs(cur.fogNear - 1) < 0.003) cur.fogNear = 1;
      if (Math.abs(cur.fogFar - 1) < 0.003) cur.fogFar = 1;
      if (Math.abs(cur.skyBlend) < 0.004) cur.skyBlend = 0;
    }

    // ---- 雨丝 ----
    if (rainMesh && rainMat) {
      const count = Math.round(cur.rainCount);
      rainMesh.visible = count > 1 && cur.rainOpacity > 0.002;
      if (rainMesh.visible) {
        rainGeo.setDrawRange(0, Math.min(rainMax, count) * 2);
        rainMat.uniforms.uTime.value = simTime;
        camera.getWorldPosition(_center);
        camera.getWorldDirection(_forward);
        _center.addScaledVector(_forward, RAIN_FORWARD);
        _center.y += RAIN_Y_OFFSET;
        rainMat.uniforms.uCenter.value.copy(_center);
        rainMat.uniforms.uVel.value.set(cur.windX, -cur.rainSpeed, cur.windZ);
        rainMat.uniforms.uStreak.value = cur.rainStreak;
        rainMat.uniforms.uOpacity.value = cur.rainOpacity;
        _rainColor.copy(RAIN_COLOR).lerp(WHITE, flash * 0.55);
        rainMat.uniforms.uColor.value.copy(_rainColor);
      }
    }

    // ---- 雪花 ----
    if (snowMesh && snowMat) {
      const count = Math.round(cur.snowCount);
      snowMesh.visible = count > 1 && cur.snowOpacity > 0.002;
      if (snowMesh.visible) {
        snowGeo.setDrawRange(0, Math.min(snowMax, count));
        snowMat.uniforms.uTime.value = simTime;
        camera.getWorldPosition(_center);
        camera.getWorldDirection(_forward);
        _center.addScaledVector(_forward, SNOW_FORWARD);
        _center.y += SNOW_Y_OFFSET;
        snowMat.uniforms.uCenter.value.copy(_center);
        snowMat.uniforms.uFall.value = cur.snowSpeed;
        snowMat.uniforms.uOpacity.value = cur.snowOpacity;
        snowMat.uniforms.uPixelRatio.value = getPixelRatio();
      }
    }

    // ---- 地面积雪 / 湿地面 ----
    if (snowGround && snowGroundMat) {
      snowGroundMat.opacity = 0.93 * cur.groundSnow;
      snowGround.visible = snowGroundMat.opacity > 0.004;
      snowGroundMat.depthWrite = snowGroundMat.opacity > 0.08;
    }
    if (wetGround && wetGroundMat) {
      wetGroundMat.opacity = Math.min(0.9, cur.groundWet);
      wetGround.visible = wetGroundMat.opacity > 0.004;
      wetGroundMat.depthWrite = wetGroundMat.opacity > 0.08;
    }

    applyAtmosphere();
  }

  const _center = new THREE.Vector3();
  const _forward = new THREE.Vector3();

  function getPixelRatio() {
    if (renderer && typeof renderer.getPixelRatio === 'function') {
      return renderer.getPixelRatio();
    }
    return typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                         */
  /* ------------------------------------------------------------------ */

  function setWeather(id) {
    if (disposed) return;
    const next = WEATHER_IDS.has(id) ? id : 'clear';
    if (next === currentId) return;
    currentId = next;
    if (currentId !== 'thunder') {
      lightning.nextAt = 0;
      lightning.strikeAt = -1e6;
      flash = 0;
    }
  }

  function getWeather() {
    return currentId;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;

    // 恢复基线：先恢复 fog / 天空，再恢复曝光。
    if (scene && scene.fog && baseFogRef && scene.fog === baseFogRef && hasFogBase) {
      scene.fog.color.copy(baseFogColor);
      scene.fog.near = baseFogNear;
      scene.fog.far = baseFogFar;
    }
    if (skyUniforms && hasSkyBase) {
      skyUniforms.uTop.value.copy(baseSkyTop);
      skyUniforms.uHorizon.value.copy(baseSkyHorizon);
    }
    if (renderer && typeof renderer.toneMappingExposure === 'number') {
      renderer.toneMappingExposure = baseExposure;
    }

    if (root) {
      root.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        const material = obj.material;
        if (material) {
          const list = Array.isArray(material) ? material : [material];
          for (const m of list) {
            if (m.uniforms) {
              // 雪贴图在材质 uniform 里，单独释放
              const map = m.uniforms.uMap && m.uniforms.uMap.value;
              if (map && map.dispose) map.dispose();
            }
            if (m.map && m.map.dispose) m.map.dispose();
            m.dispose();
          }
        }
      });
      if (root.parent) root.parent.remove(root);
    }

    if (snowTexture && snowTexture.dispose) snowTexture.dispose();
    if (snowNoiseTexture && snowNoiseTexture.dispose) snowNoiseTexture.dispose();

    rainMesh = null;
    rainMat = null;
    rainGeo = null;
    snowMesh = null;
    snowMat = null;
    snowGeo = null;
    snowGround = null;
    snowGroundMat = null;
    wetGround = null;
    wetGroundMat = null;
    groundGeo = null;
    flashLight = null;
    root = null;
  }

  return { setWeather, getWeather, setHour, tick, dispose };
}
