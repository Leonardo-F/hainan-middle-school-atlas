/**
 * 校园巡游影片（自动化运镜 + 录制）
 * ---------------------------------------------------------------------------
 * 为一个「会动的图志」写一条 60–90 秒的电影式巡游：高空俯冲入校 → 北门 →
 * 凤栖堂（外景 → 室内）→ 主教学楼（外景 → 门厅 → 走廊 → 教室）→ 科学馆/
 * 艺术楼掠过 → 图书馆（外景 → 阅览室）→ 体育馆/看台 → 运动场 → 升空收尾。
 *
 * 设计原则
 * - 纯运镜层：只读写 camera.position / controls.target / camera.fov 与
 *   controls.enabled，不修改场景几何、天气、日照；停止时精确恢复原相机。
 * - 每段 4–8 s，position/target/fov 用 easeInOutCubic 插值；到站可留 0.5–2.2 s
 *   定格并做极轻微推近（hold 期间的 drift），避免生硬顿挫。
 * - 室内机位优先读 campus.interiorCameras（js/interiors.js 提供），缺失时用
 *   按 site 中心/角度估算的 fallback（见 FALLBACK_INTERIORS 注释）。
 * - 录制：canvas.captureStream(30) + MediaRecorder（vp9 → vp8 → webm 回退）；
 *   recordStop() 返回 Promise<Blob>，由页面层决定是否下载。
 * - 时间基准用 rAF 墙钟（clamp 到 0.25 s），headless 低帧率下影片不会变慢动作。
 *
 * 对外 API（main.js 按此接线，勿改名）
 * ---------------------------------------------------------------------------
 *   import { createFilm, FILM_TITLE } from './film.js';
 *   const film = createFilm({ scene, camera, controls, renderer, campus, onStateChange });
 *   film.start({ restart });   // 开始/重播；播放中重复调用默认忽略
 *   film.stop();               // 退出并恢复原相机；若在录制中，录制保持，由调用方 recordStop()
 *   film.isPlaying(); film.getProgress(); film.isRecording();
 *   film.recordStart();        // 开始录制，返回 boolean（MediaRecorder 不可用为 false）
 *   film.recordStop();         // Promise<Blob|null>
 *   film.dispose();            // 停止一切并释放
 *   film.segments;             // 只读的段落表（调试/验证用）
 *   // 以下为调试/审片辅助（可选，不影响正常播放流程）：
 *   film.pause(); film.resume(); film.seek(seconds);
 *
 * 场景坐标约定：1 单位 ≈ 2 m，x 东、z 南、北 = -z；相机 y 为场景高度。
 * 外景机位与 js/data.js 中 LANDMARKS 的 camera 数据保持一致（此处硬编码，
 * 避免 film 反向依赖数据层；若 data.js 机位调整，这里同步即可）。
 */

const RECORD_MIME_CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm'
];

export const FILM_TITLE = '府城校园图志 · 巡游';
export const FILM_FILENAME = '府城校园图志-巡游.webm';

/* ------------------------------------------------------------------ */
/*  外景机位（与 js/data.js LANDMARKS.camera 同值）                     */
/* ------------------------------------------------------------------ */

const EXTERIOR = {
  overview: { position: [-150, 260, -230], target: [0, 0, -12], fov: 34 },
  gate: { position: [-50.9, 9.3, -91.8], target: [-39, 2.4, -74], fov: 38 },
  fengqi: { position: [-34, 8.8, -32.1], target: [-46.2, 2.2, -50.5], fov: 38 },
  hall1: { position: [-27, 37, -86], target: [-4, 7, -36], fov: 46.1 },
  science: { position: [-12, 28, -62], target: [27, 4, -2], fov: 43.8 },
  art: { position: [26, 20, -22], target: [52.8, 7, 7.9], fov: 46 },
  library: { position: [2, 7, -56], target: [24, 5, -72], fov: 40 },
  gym: { position: [-30, 20, 76], target: [-52, 4, 26], fov: 38 },
  stand: { position: [-70, 14, -18], target: [-62, 2, 2], fov: 42 },
  field: { position: [-124, 10, -26], target: [-92, 0.8, -11], fov: 48.3 }
};

/* 高空过渡机位：让俯冲/转场有明确的飞行方向感。 */
const TRANSIT = {
  descent: { position: [-64, 66, -186], target: [-36, 7, -72], fov: 42 },
  afterFengqi: { position: [-34, 16, -24], target: [-10, 5, -32], fov: 42 },
  toLibrary: { position: [4, 19, -33], target: [30, 6, -52], fov: 45 },
  toGym: { position: [6, 22, 12], target: [-34, 5, 40], fov: 45 },
  standApproach: { position: [-24, 32, 34], target: [-64, 4, 2], fov: 40 },
  finale: { position: [-150, 178, 24], target: [-40, 0, -8], fov: 40 }
};

/**
 * 室内机位 fallback（仅当 campus.interiorCameras 缺失时使用）。
 * 由 site.js 的 center/obb 与建筑模块旋转约定估算：
 *   主教学楼 center(-0.37,-30.66) obb 57.24×9.77 angle138.5，前面(+z 局部)朝西北；
 *   图书馆    center(24,-72)     obb 19×10     angle138.5，入口朝东南；
 *   凤栖堂    center(-46.32,-50.19) obb 13.36×8.58 angle140.25，门朝东南。
 * 高度约 1.2–1.3（≈2.5 m 人眼），fov 偏广以容纳室内。数值是写意估计，
 * 正式机位以 js/interiors.js 的 interiorCameras 为准。
 */
const FALLBACK_INTERIORS = {
  fengqiHall: { position: [-44.27, 1.25, -47.73], target: [-48.62, 1.05, -52.96], fov: 55 },
  mainHallLobby: { position: [-2.62, 1.25, -33.21], target: [-10.86, 1.3, -39.94], fov: 54 },
  mainHallCorridor: { position: [-8.66, 1.3, -38.19], target: [7.12, 1.3, -24.03], fov: 56 },
  mainHallClassroom: { position: [-4.37, 1.3, -33.71], target: [-7.02, 1.2, -36.71], fov: 52 },
  libraryReading: { position: [25.66, 1.25, -70.13], target: [22.01, 1.2, -74.25], fov: 55 }
};

/**
 * 过门机位：沿室内机位的「看线」反向退到门外约 5.4 场景单位（≈11 m）处，
 * 再略微俯视门洞。这样无论 interiorCameras 怎样调整，镜头都是顺着门轴推进，
 * 不会斜穿墙体。
 */
function approachView(interior) {
  const p = interior.position;
  const t = interior.target;
  const dx = p[0] - t[0];
  const dy = p[1] - t[1];
  const dz = p[2] - t[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  const back = 7.0;
  return {
    position: [p[0] + (dx / len) * back, p[1] + Math.max(0, (dy / len) * back) + 0.35, p[2] + (dz / len) * back],
    target: [p[0] + (t[0] - p[0]) * 0.22, p[1] + (t[1] - p[1]) * 0.22, p[2] + (t[2] - p[2]) * 0.22],
    fov: Math.min(62, interior.fov + 2)
  };
}

/* ------------------------------------------------------------------ */
/*  工具                                                              */
/* ------------------------------------------------------------------ */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * 穿墙压黑的包络：rise 段升到全黑，fall 段退回 0；两段都为 0 时不影响画面。
 * 首尾都回到 0，保证 hold ↔ move 切换时不会突然闪黑。
 */
function washEnvelope(local, wash) {
  const [riseStart, riseEnd] = wash.rise;
  const [fallStart, fallEnd] = wash.fall;
  if (local <= riseStart) return 0;
  if (local < riseEnd) {
    return easeInOutCubic((local - riseStart) / Math.max(0.001, riseEnd - riseStart));
  }
  if (local < fallStart) return 1;
  if (local < fallEnd) {
    return 1 - easeInOutCubic((local - fallStart) / Math.max(0.001, fallEnd - fallStart));
  }
  return 0;
}

function toVec3(value, fallback) {
  const source = Array.isArray(value) && value.length >= 3 ? value : fallback;
  return [Number(source[0]) || 0, Number(source[1]) || 0, Number(source[2]) || 0];
}

function normalizeView(view, fallback) {
  const source = view || fallback || {};
  const fb = fallback || {};
  return {
    position: toVec3(source.position, fb.position || [0, 30, 0]),
    target: toVec3(source.target, fb.target || [0, 0, 0]),
    fov: clamp(Number(source.fov) || Number(fb.fov) || 42, 18, 90)
  };
}

function lerpArray(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * 从 campus.interiorCameras 读机位；缺失 / 字段不全时退回 fallback。
 * 每次 start() 重新读取，因此 interiors.js 晚于本文件交付也能自动生效。
 */
function resolveInterior(campus, key) {
  const fallback = FALLBACK_INTERIORS[key];
  const provided = campus?.interiorCameras?.[key];
  if (!provided) return normalizeView(fallback, fallback);
  const view = normalizeView(provided, fallback);
  // 防止 interiorCameras 只给了 position 时把相机放到地面原点。
  if (!Array.isArray(provided.target)) view.target = fallback.target.slice();
  return view;
}

function formatTime(seconds) {
  const safe = Math.max(0, Math.round(seconds));
  const mm = String(Math.floor(safe / 60)).padStart(2, '0');
  const ss = String(safe % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function isMediaRecorderSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
  );
}

function pickRecordMimeType() {
  if (!isMediaRecorderSupported()) return '';
  const supported = window.MediaRecorder.isTypeSupported
    ? (type) => window.MediaRecorder.isTypeSupported(type)
    : () => true;
  return RECORD_MIME_CANDIDATES.find((type) => supported(type)) || '';
}

/* ------------------------------------------------------------------ */
/*  影片脚本                                                          */
/* ------------------------------------------------------------------ */

/**
 * 段落定义：每个 shot 是「到站机位」；duration = 从上一站飞来的时间（秒），
 * hold = 到站后定格时间（秒）。首站的 hold 是开场定格。
 * 总时长约 85 s（落在 60–90 s 区间），交代：入校 → 北门 → 凤栖堂(内外)
 * → 主教学楼(外内) → 图书馆(外内) → 体育馆/看台/运动场 → 升空。
 */
function buildShotPlan(campus) {
  const fengqiIn = resolveInterior(campus, 'fengqiHall');
  const lobby = resolveInterior(campus, 'mainHallLobby');
  const corridor = resolveInterior(campus, 'mainHallCorridor');
  const classroom = resolveInterior(campus, 'mainHallClassroom');
  const reading = resolveInterior(campus, 'libraryReading');
  const fengqiDoor = approachView(fengqiIn);
  const hall1Door = approachView(lobby);
  const libraryDoor = approachView(reading);

  return [
    {
      id: 'intro',
      caption: '府城校园 · 一座校园的记忆',
      en: 'FUCHENG CAMPUS · A CAMPUS ATLAS',
      view: EXTERIOR.overview,
      hold: 1.8,
      duration: 0
    },
    {
      id: 'descent',
      caption: '从高空进入校园',
      en: 'DESCENT INTO THE CAMPUS',
      view: TRANSIT.descent,
      duration: 4.8
    },
    {
      id: 'gate',
      caption: '北门 · 牌楼式校门',
      en: 'NORTH GATE',
      view: EXTERIOR.gate,
      duration: 4.2,
      hold: 0.5
    },
    {
      id: 'fengqi-out',
      caption: '凤栖堂 · 1934 年建',
      en: 'FENGQI HALL',
      view: EXTERIOR.fengqi,
      duration: 4.2
    },
    {
      id: 'fengqi-door',
      caption: '走近凤栖堂',
      en: 'APPROACHING FENGQI HALL',
      view: fengqiDoor,
      duration: 3.2
    },
    {
      id: 'fengqi-in',
      interior: true,
      caption: '凤栖堂 · 厅堂',
      en: 'FENGQI HALL · INTERIOR',
      view: fengqiIn,
      duration: 3.6,
      hold: 1.2
    },
    {
      id: 'fengqi-exit',
      caption: '穿过院落',
      en: 'THROUGH THE COURTYARD',
      view: TRANSIT.afterFengqi,
      duration: 3.8
    },
    {
      id: 'hall1-out',
      caption: '主教学楼 · 五层长楼',
      en: 'MAIN TEACHING BUILDING',
      view: EXTERIOR.hall1,
      duration: 4.2,
      hold: 0.5
    },
    {
      id: 'hall1-door',
      caption: '进入教学楼',
      en: 'ENTERING THE TEACHING BUILDING',
      view: hall1Door,
      duration: 2.8
    },
    {
      id: 'hall1-lobby',
      interior: true,
      caption: '主教学楼 · 门厅',
      en: 'MAIN HALL · LOBBY',
      view: lobby,
      duration: 3.4,
      hold: 1.2
    },
    {
      id: 'hall1-corridor',
      interior: true,
      caption: '主教学楼 · 走廊',
      en: 'MAIN HALL · CORRIDOR',
      view: corridor,
      duration: 3.6,
      hold: 0.8
    },
    {
      id: 'hall1-classroom',
      interior: true,
      cut: true,
      caption: '主教学楼 · 教室',
      en: 'MAIN HALL · CLASSROOM',
      view: classroom,
      duration: 2.6,
      hold: 0.9
    },
    {
      id: 'library-out',
      caption: '图书馆',
      en: 'LIBRARY',
      view: EXTERIOR.library,
      duration: 3.0,
      hold: 1.2
    },
    {
      id: 'library-door',
      caption: '走进图书馆',
      en: 'ENTERING THE LIBRARY',
      view: libraryDoor,
      duration: 2.2
    },
    {
      id: 'library-in',
      interior: true,
      caption: '图书馆 · 阅览室',
      en: 'LIBRARY · READING ROOM',
      view: reading,
      duration: 3.4,
      hold: 4.0
    },
    {
      id: 'art-pass',
      caption: '科学馆与艺术楼',
      en: 'SCIENCE HALL & ART BUILDING',
      view: EXTERIOR.art,
      duration: 3.0
    },
    {
      id: 'to-gym',
      caption: '体育馆与球场',
      en: 'GYM & COURTS',
      view: EXTERIOR.gym,
      duration: 3.0,
      hold: 0.6
    },
    {
      id: 'stand-approach',
      caption: '主席台与看台',
      en: 'GRANDSTAND & TRACK',
      view: TRANSIT.standApproach,
      duration: 2.2
    },
    {
      id: 'stand',
      caption: '主席台与看台',
      en: 'GRANDSTAND',
      view: EXTERIOR.stand,
      duration: 2.6,
      hold: 1.0
    },
    {
      id: 'field',
      caption: '运动场 · 塑胶跑道',
      en: 'SPORTS FIELD',
      view: EXTERIOR.field,
      duration: 3.2,
      hold: 0.4
    },
    {
      id: 'finale',
      caption: '府城校园 · 百年校本',
      en: 'FUCHENG CAMPUS · SINCE 1923',
      view: TRANSIT.finale,
      duration: 5.8,
      hold: 1.9
    }
  ];
}

/** 把 shot 列表编译为带绝对起止时间的 segments。 */
function buildSegments(plan) {
  const segments = [];
  let t = 0;
  if (plan[0].hold) {
    segments.push({
      type: 'hold', shotIndex: 0, start: 0, end: plan[0].hold, duration: plan[0].hold
    });
    t = plan[0].hold;
  }
  for (let i = 1; i < plan.length; i += 1) {
    const duration = Math.max(2.5, plan[i].duration || 4);
    // 穿墙瞬间（室内 ↔ 室外）用一次「压黑」过渡遮住墙体断面，
    // 读起来像电影里的淡出/淡入，而不是穿模。
    const fromShot = plan[i - 1];
    const toShot = plan[i];
    let wash = null;
    if (fromShot.interior && !toShot.interior) {
      // 出门：起步就压黑，遮住墙体断面后再亮出室外。
      wash = { rise: [0, 0.08], fall: [0.1, 0.3] };
    } else if (!fromShot.interior && toShot.interior) {
      // 进门：先在门外压黑，黑场中穿过墙体/门洞，到站前再亮出室内。
      wash = { rise: [0.3, 0.55], fall: [0.9, 1] };
    } else if (fromShot.interior && toShot.interior && toShot.cut) {
      // 室内换房间（走廊 → 教室）会穿过隔墙：用一个短黑场当作切镜。
      wash = { rise: [0.42, 0.52], fall: [0.52, 0.64] };
    }
    segments.push({ type: 'move', shotIndex: i, start: t, end: t + duration, duration, wash });
    t += duration;
    if (plan[i].hold) {
      segments.push({ type: 'hold', shotIndex: i, start: t, end: t + plan[i].hold, duration: plan[i].hold });
      t += plan[i].hold;
    }
  }
  return { segments, total: t };
}

/* ------------------------------------------------------------------ */
/*  影片控制                                                          */
/* ------------------------------------------------------------------ */

export function createFilm({ scene, camera, controls, renderer, campus, onStateChange } = {}) {
  let disposed = false;
  let playing = false;
  let paused = false;
  let rafId = 0;
  let elapsed = 0;
  let lastTimestamp = 0;

  let plan = [];
  let segments = [];
  let total = 0;
  let buildRevision = 0;

  let saved = null;
  let currentShotIndex = -1;

  let recorder = null;
  let recordChunks = [];
  let recording = false;
  let recordMime = '';

  if (!camera || !controls) {
    // 没有相机/控制器时降级为 no-op 对象，main.js 可安全可选链调用。
    return {
      start: () => false,
      stop: () => false,
      isPlaying: () => false,
      getProgress: () => 0,
      isRecording: () => false,
      recordStart: () => false,
      recordStop: () => Promise.resolve(null),
      dispose: () => {},
      segments: []
    };
  }

  function snapshot(extra = {}) {
    const safeTotal = total || 1;
    return {
      playing,
      recording,
      progress: clamp(elapsed / safeTotal, 0, 1),
      time: elapsed,
      duration: total,
      index: currentShotIndex,
      caption: plan[currentShotIndex]?.caption || '',
      en: plan[currentShotIndex]?.en || '',
      title: FILM_TITLE,
      wash: 0,
      ...extra
    };
  }

  function emit(extra) {
    if (typeof onStateChange !== 'function') return;
    try {
      onStateChange(snapshot(extra));
    } catch (error) {
      console.warn('Film state listener failed:', error);
    }
  }

  function ensurePlan(force = false) {
    if (plan.length && !force) return;
    plan = buildShotPlan(campus);
    const compiled = buildSegments(plan);
    segments = compiled.segments;
    total = compiled.total;
    buildRevision += 1;
  }

  function saveCameraState() {
    saved = {
      position: camera.position.clone(),
      target: controls.target.clone(),
      fov: camera.fov,
      enabled: controls.enabled
    };
  }

  function restoreCameraState() {
    if (!saved) return;
    camera.position.copy(saved.position);
    controls.target.copy(saved.target);
    camera.fov = saved.fov;
    camera.updateProjectionMatrix();
    controls.enabled = saved.enabled;
    saved = null;
    try {
      controls.update();
    } catch (error) {
      console.warn('Film: failed to restore controls:', error);
    }
  }

  function applyView(view) {
    camera.position.set(view.position[0], view.position[1], view.position[2]);
    controls.target.set(view.target[0], view.target[1], view.target[2]);
    // main.js 在影片期间跳过 controls.update()（否则 OrbitControls 会回写相机），
    // 因此这里必须自己 lookAt，否则相机停留在进入影片前的朝向。
    camera.lookAt(view.target[0], view.target[1], view.target[2]);
    if (Math.abs(camera.fov - view.fov) > 0.01) {
      camera.fov = view.fov;
      camera.updateProjectionMatrix();
    }
  }

  /** 采样 elapsed 时刻的机位与当前 shot（hold 期间做极轻微推近）。 */
  function sample(at) {
    const time = clamp(at, 0, total);
    let segment = segments[segments.length - 1];
    for (let i = 0; i < segments.length; i += 1) {
      if (time < segments[i].end) {
        segment = segments[i];
        break;
      }
    }
    const shot = plan[segment.shotIndex] || plan[plan.length - 1];
    const view = normalizeView(shot.view, EXTERIOR.overview);

    if (segment.type === 'move') {
      const local = clamp((time - segment.start) / Math.max(0.001, segment.end - segment.start), 0, 1);
      const captionIndex = local < 0.39 ? Math.max(0, segment.shotIndex - 1) : segment.shotIndex;
      const eased = easeInOutCubic(local);
      const from = normalizeView(plan[segment.shotIndex - 1].view, view);
      const wash = segment.wash ? washEnvelope(local, segment.wash) : 0;
      return {
        shot,
        index: captionIndex,
        shotIndex: segment.shotIndex,
        position: lerpArray(from.position, view.position, eased),
        target: lerpArray(from.target, view.target, eased),
        fov: from.fov + (view.fov - from.fov) * eased,
        wash
      };
    }

    // hold：定格，并沿看线做 1.2% 的缓慢推近，让画面「有呼吸」。
    const local = clamp((time - segment.start) / Math.max(0.001, segment.end - segment.start), 0, 1);
    const drift = easeInOutCubic(local) * 0.012;
    return {
      shot,
      index: segment.shotIndex,
      shotIndex: segment.shotIndex,
      position: lerpArray(view.position, view.target, drift),
      target: view.target.slice(),
      fov: view.fov,
      wash: 0
    };
  }

  function frame(timestamp) {
    if (disposed || !playing || paused) return;
    const rawDelta = lastTimestamp ? (timestamp - lastTimestamp) / 1000 : 0;
    lastTimestamp = timestamp;
    elapsed += clamp(rawDelta, 0, 0.25);

    const sampleNow = sample(elapsed);
    applyView(sampleNow);
    currentShotIndex = sampleNow.index;
    emit({ wash: clamp(sampleNow.wash || 0, 0, 1) });

    if (elapsed >= total) {
      finishPlayback();
      return;
    }
    rafId = requestAnimationFrame(frame);
  }

  function finishPlayback() {
    playing = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    currentShotIndex = plan.length - 1;
    elapsed = total;
    restoreCameraState();
    emit({ ended: true, progress: 1 });
  }

  function start(options = {}) {
    if (disposed) return false;
    const restart = options.restart === true;
    if (playing && !restart) return false;
    // 每次开播都重新读取 campus.interiorCameras（interiors.js 可能后到）。
    ensurePlan(true);
    if (!segments.length) return false;

    if (!playing) {
      saveCameraState();
    } else if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    controls.enabled = false;
    playing = true;
    elapsed = 0;
    currentShotIndex = -1;
    lastTimestamp = 0;

    const first = sample(0);
    applyView(first);
    currentShotIndex = first.index;
    emit({ started: true, ended: false });

    lastTimestamp = performance.now();
    rafId = requestAnimationFrame(frame);
    return true;
  }

  function stop() {
    if (!playing) return false;
    playing = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    restoreCameraState();
    emit({ stopped: true });
    return true;
  }

  /* ---------------- 录制 ---------------- */

  function recordStart() {
    if (disposed || recording) return false;
    if (!renderer || !renderer.domElement || !isMediaRecorderSupported()) return false;
    let stream;
    try {
      stream = renderer.domElement.captureStream(30);
    } catch (error) {
      console.warn('Film: captureStream failed:', error);
      return false;
    }
    recordMime = pickRecordMimeType();
    try {
      recorder = recordMime
        ? new window.MediaRecorder(stream, { mimeType: recordMime, videoBitsPerSecond: 8_000_000 })
        : new window.MediaRecorder(stream);
    } catch (error) {
      console.warn('Film: MediaRecorder failed:', error);
      recorder = null;
      return false;
    }
    recordChunks = [];
    recording = true;
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) recordChunks.push(event.data);
    };
    recorder.onerror = (event) => {
      console.warn('Film: recorder error:', event?.error || event);
    };
    try {
      recorder.start(250);
    } catch (error) {
      console.warn('Film: recorder start failed:', error);
      recorder = null;
      recording = false;
      return false;
    }
    emit({});
    return true;
  }

  function recordStop() {
    if (!recording || !recorder) {
      recording = false;
      return Promise.resolve(null);
    }
    const active = recorder;
    recording = false;
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        const type = active.mimeType || recordMime || 'video/webm';
        const blob = recordChunks.length ? new Blob(recordChunks, { type }) : null;
        recordChunks = [];
        recorder = null;
        emit({});
        resolve(blob);
      };
      active.onstop = finish;
      active.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) recordChunks.push(event.data);
      };
      try {
        active.stop();
      } catch (error) {
        console.warn('Film: recorder stop failed:', error);
        finish();
      }
      // 兜底：极端情况下 onstop 不触发
      window.setTimeout(finish, 1500);
    });
  }

  /** 暂停播放（保持当前机位，不恢复原相机）；用于审片/截图。 */
  function pause() {
    if (!playing || paused) return false;
    paused = true;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    emit({ paused: true });
    return true;
  }

  /** 继续播放；从暂停时刻的时间码接着走。 */
  function resume() {
    if (!playing || !paused) return false;
    paused = false;
    lastTimestamp = performance.now();
    rafId = requestAnimationFrame(frame);
    emit({ paused: false });
    return true;
  }

  /** 跳到指定时间码（秒）并立即把相机放到位；暂停中也可调用。 */
  function seek(seconds) {
    if (!playing || !plan.length) return false;
    paused = true;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    elapsed = clamp(Number(seconds) || 0, 0, total);
    const at = sample(elapsed);
    applyView(at);
    currentShotIndex = at.index;
    emit({ paused: true, wash: at.wash || 0 });
    return true;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (playing) stop();
    if (recording) {
      recordStop();
    }
    recording = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    plan = [];
    segments = [];
  }

  return {
    start,
    stop,
    isPlaying: () => playing,
    isPaused: () => paused,
    pause,
    resume,
    seek,
    getProgress: () => (total ? clamp(elapsed / total, 0, 1) : 0),
    isRecording: () => recording,
    getDuration: () => total,
    getTime: () => elapsed,
    recordStart,
    recordStop,
    dispose,
    get segments() {
      ensurePlan();
      return segments.map((segment) => ({
        type: segment.type,
        shotIndex: segment.shotIndex,
        id: plan[segment.shotIndex]?.id,
        caption: plan[segment.shotIndex]?.caption,
        start: segment.start,
        end: segment.end,
        duration: segment.duration || segment.end - segment.start
      }));
    }
  };
}

/** 供调试/验证：把段表格式化成可读文本。 */
export function formatFilmTime(seconds) {
  return formatTime(seconds);
}
