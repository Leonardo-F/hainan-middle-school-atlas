import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { buildCampus } from './campus-accurate.js';
import {
  CAMPUS_LIST,
  buildCampusSearch,
  parseCampusParam,
  resolveCampus
} from './campuses.js';
import { WEATHERS, createWeather } from './weather.js';
import { createFilm, FILM_TITLE } from './film.js';

/* ------------------------------------------------------------------ */
/*  Elements & state                                                   */
/* ------------------------------------------------------------------ */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clamp = THREE.MathUtils.clamp;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
const params = new URLSearchParams(window.location.search);

/* ------------------------------------------------------------------ */
/*  Multi-campus registry & routing                                    */
/*  数据层：js/campuses.js（注册表 / URL 契约）；场景层：js/campus-accurate.js */
/*  ?campus=<id> 解析见 parseCampusParam；未知 / planned 回退默认校区，      */
/*  规范化与回退提示在 finishBoot() 里处理。                                */
/* ------------------------------------------------------------------ */

const route = parseCampusParam(window.location.search);
let ACTIVE_CAMPUS = route.campus;
let SITE = ACTIVE_CAMPUS.site;
let LANDMARKS = ACTIVE_CAMPUS.landmarks;
let TOUR_ORDER = ACTIVE_CAMPUS.tourOrder;
let SOURCES = ACTIVE_CAMPUS.sources;
let desktopOverview = buildDesktopOverview(ACTIVE_CAMPUS);

const app = $('#app');
const loading = $('#loading');
const loadingBar = $('#loadingBar');
const loadingPct = $('#loadingPct');
const loadingStage = $('#loadingStage');
const canvas = $('#scene');
const infoCard = $('#infoCard');
const infoNumber = $('#infoNumber');
const infoKind = $('#infoKind');
const infoTitle = $('#infoTitle');
const infoEn = $('#infoEn');
const infoSummary = $('#infoSummary');
const infoDescription = $('#infoDescription');
const infoFacts = $('#infoFacts');
const infoDrawing = $('#infoDrawing');
const indexNav = $('#index');
const indexList = $('#indexList');
const markerLayer = $('#markers');
const tourButton = $('#tourButton');
const tourLabel = $('[data-tour-label]', tourButton);
const timeRange = $('#timeRange');
const timeReadout = $('#timeReadout');
const lightState = $('#lightState');
const lightPhase = $('#lightPhase');
const weatherRange = $('#weatherRange');
const weatherIcon = $('#weatherIcon');
const weatherName = $('#weatherName');
const weatherEn = $('#weatherEn');
const weatherPhase = $('#weatherPhase');
const filmButton = $('#filmButton');
const filmLayer = $('#filmLayer');
const filmTitleEl = $('#filmTitle');
const filmCaptionEl = $('#filmCaption');
const filmCaptionEnEl = $('#filmCaptionEn');
const filmTimeEl = $('#filmTime');
const filmDurationEl = $('#filmDuration');
const filmMetaTitleEl = $('#filmMetaTitle');
const filmProgressBar = $('#filmProgressBar');
const filmProgressFill = $('#filmProgressFill');
const filmWash = $('#filmWash');
const filmRecEl = $('#filmRec');
const filmRecordButton = $('#filmRecord');
const filmExitButton = $('#filmExit');
const phaseLabel = $('#phaseLabel');
const clockLabel = $('#clock');
const nightButton = $('#nightButton');
const toastEl = $('#toast');
const cursorEl = $('#cursor');
const minimap = $('#minimap');
const aboutDialog = $('#aboutDialog');
const interactionHint = $('#interactionHint');
const stageEl = $('.stage');
const narrativeEl = $('#narrativeScroll');
const sceneTitleEl = $('#sceneTitle');
const sceneEnEl = $('#sceneEn');
const sceneKindEl = $('#sceneKind');
const introSpotCount = $('#introSpotCount');
const indexRange = $('#indexRange');

const state = {
  campusId: ACTIVE_CAMPUS.id,
  switching: false,
  activeId: null,
  hour: 16.3,
  dayHour: 16.3,
  isNight: false,
  weatherId: 'clear',
  filmActive: false,
  filmRecording: false,
  tourActive: false,
  tourIndex: -1,
  tourTimer: null,
  toastTimer: null,
  mapTick: 0,
  hoveredSpot: null,
  modalOpen: false,
  revealTimer: null
};

let scene;
let camera;
let renderer;
let controls;
let campus;
let weather;
let film;
let filmUiCache = { index: -1, seconds: -1, duration: -1, recording: null };
let raycaster;
let pointerNdc;
let clock;
let lastFrame = 0;
let cameraTween = null;
let markerEntries = [];
let mapDpr = 1;
let mapW = 0;
let mapH = 0;
let isPointerDown = false;
let pointerStart = { x: 0, y: 0, time: 0 };
let lastHoverRay = 0;
let cursorTarget = { x: 0, y: 0 };
let cursorPos = { x: 0, y: 0 };
let hasCustomCursor = false;

/** 当前 active 校区的桌面端总览取景；相机数据以 js/data.js 定稿值为准。 */
function buildDesktopOverview(campusEntry) {
  return {
    position: campusEntry.overview.position,
    target: campusEntry.overview.target,
    fov: campusEntry.overview.fov
  };
}

const MOBILE_FRAME_WIDTH = {
  gate: 21,
  fengqi: 21,
  yanlin: 21,
  hall1: 65,
  science: 65,
  gym: 44,
  field: 115,
  tree: 23,
  hall2: 56,
  hall3: 52,
  art: 30,
  stream: 38,
  hand: 16,
  study: 16,
  southgate: 18,
  stone: 15,
  confucius: 11,
  bronze: 13,
  stand: 42
};

function isPhoneLayout() {
  return window.innerWidth <= 900;
}

/* The canvas now lives inside the bounded scene card, so every framing
   decision is based on the card's aspect ratio rather than the window's. */
let viewW = 0;
let viewH = 0;
const BASE_VIEW_ASPECT = 1.6;

function measureViewport() {
  const w = canvas ? canvas.clientWidth : 0;
  const h = canvas ? canvas.clientHeight : 0;
  viewW = w > 0 ? w : window.innerWidth;
  viewH = h > 0 ? h : window.innerHeight;
}

function viewAspect() {
  if (!viewW || !viewH) measureViewport();
  return viewW / Math.max(1, viewH);
}

/**
 * Camera framing contract with js/data.js:
 * data.js camera values are authoritative at the scene-card aspect used for
 * desktop review (1600×1000 → 1151×842 ≈ 1.37). Other aspect ratios adapt by
 * preserving the horizontal composition, so the same data reads correctly on
 * 1280×800 cards, wide tablets and phones.
 */
const DESIGN_ASPECT = 1151 / 840;

function designFov(baseFov, aspect = viewAspect()) {
  const a = clamp(aspect, 0.75, 2.6);
  const fov = THREE.MathUtils.radToDeg(
    2 * Math.atan((Math.tan(THREE.MathUtils.degToRad(baseFov / 2)) * DESIGN_ASPECT) / a)
  );
  return clamp(fov, 18, 72);
}

function getOverviewView() {
  const aspect = viewAspect();
  if (isPhoneLayout() && aspect < 1.15) {
    // Portrait scene card: a higher, closer aerial fills the tall card; the FOV
    // keeps the 90%-width composition tuned at the 390×844 card aspect (0.834).
    const fov = THREE.MathUtils.radToDeg(
      2 * Math.atan((Math.tan(THREE.MathUtils.degToRad(40.5) / 2) * 0.834) / aspect)
    );
    return {
      position: [-140, 350, -320],
      target: [0, 0, -14],
      fov: clamp(fov, 20, 52)
    };
  }
  return {
    position: desktopOverview.position,
    target: desktopOverview.target,
    fov: designFov(desktopOverview.fov, aspect)
  };
}

function getTopView() {
  const aspect = viewAspect();
  if (isPhoneLayout() && aspect < 1.15) {
    const fov = THREE.MathUtils.radToDeg(
      2 * Math.atan((Math.tan(THREE.MathUtils.degToRad(27) / 2) * 0.834) / aspect)
    );
    return {
      position: [0, 720, 55],
      target: [0, 0, 0],
      fov: clamp(fov, 20, 52)
    };
  }
  return {
    position: ACTIVE_CAMPUS.top.position,
    target: ACTIVE_CAMPUS.top.target,
    fov: designFov(ACTIVE_CAMPUS.top.fov, aspect)
  };
}

/** Fit a landmark to the scene card, widening the frame when it is tall/narrow. */
function getSpotView(spot) {
  const aspect = viewAspect();
  if (aspect >= 1.15) {
    return {
      position: spot.camera.position,
      target: spot.camera.target,
      fov: designFov(spot.camera.fov, aspect)
    };
  }
  const fov = 52;
  const target = new THREE.Vector3(...spot.camera.target);
  const offset = new THREE.Vector3(...spot.camera.position).sub(target);
  const desiredWidth =
    ((ACTIVE_CAMPUS.mobile?.frameWidth?.[spot.id] ?? MOBILE_FRAME_WIDTH[spot.id]) || 30) * 1.16;
  const requiredDistance = desiredWidth / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aspect);
  const distance = Math.max(offset.length(), requiredDistance);
  offset.setLength(distance);
  return {
    position: target.clone().add(offset).toArray(),
    target: target.toArray(),
    fov
  };
}

/* ------------------------------------------------------------------ */
/*  Boot                                                               */
/* ------------------------------------------------------------------ */

boot();

async function boot() {
  try {
    setupRenderer();
    setupSceneGraph();
    const startedAt = performance.now();
    setLoadingState(6, '正在构筑校园地形');
    await nextFrame();
    await Promise.race([document.fonts.ready, wait(700)]);
    await wait(reducedMotion || params.get('nointro') ? 20 : 160);
    setLoadingState(24, '正在校准中轴与院落');
    await nextFrame();
    await wait(reducedMotion || params.get('nointro') ? 10 : 150);
    setLoadingState(43, '正在立起坡屋面');
    await nextFrame();
    campus = buildCampus(scene, renderer, {
      campus: ACTIVE_CAMPUS,
      site: SITE,
      landmarks: LANDMARKS,
      theme: ACTIVE_CAMPUS.theme,
      reducedMotion
    });
    // 天气层建立在校园世界之上；引擎缺失/抛错时降级为 null，页面照常可用。
    weather = createWeatherLayer();
    applyWeather(resolveInitialWeather(), { silent: true });
    // 影片控制器：室内机位来自 campus.interiorCameras，切校区后重建。
    film = createFilmLayer();
    setLoadingState(76, '正在栽植百年榄仁树');
    await nextFrame();
    await wait(reducedMotion || params.get('nointro') ? 10 : 170);
    setLoadingState(92, '正在点亮门额与窗棂');
    hasCustomCursor =
      window.matchMedia('(hover: hover) and (pointer: fine)').matches && !coarsePointer;
    if (hasCustomCursor) document.documentElement.classList.add('has-custom-cursor');
    setupUI();
    setupEvents();
    setupIntroCamera();
    resize();
    applyHour(resolveInitialHour(), { silent: true });
    window.__campusReady = true;
    window.__campusDebug = {
      get campus() { return ACTIVE_CAMPUS; },
      get sceneApi() { return campus; },
      get scene() { return scene; },
      get renderer() { return renderer; },
      get camera() { return camera; },
      get controls() { return controls; },
      get state() { return state; },
      get weather() { return weather; },
      get weatherId() { return state.weatherId; },
      get film() { return film; },
      setWeather: (id) => applyWeather(id),
      startFilm: (options = {}) => startFilm(options),
      stopFilm: (options = {}) => stopFilm(options),
      switchCampus
    };
    clock = new THREE.Clock();
    lastFrame = performance.now();
    renderer.shadowMap.needsUpdate = true;
    renderer.setAnimationLoop(renderFrame);
    await wait(reducedMotion || params.get('nointro') ? 10 : 180);
    setLoadingState(100, '校园已就绪');
    const minLoad = reducedMotion || params.get('nointro') ? 0 : 1350;
    const elapsed = performance.now() - startedAt;
    if (elapsed < minLoad) await wait(minLoad - elapsed);
    if (!(reducedMotion || params.get('nointro'))) await wait(180);
    finishBoot();
  } catch (error) {
    console.error('Campus scene failed to initialise:', error);
    window.__showFatal?.();
  }
}

function setupRenderer() {
  measureViewport();
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(viewW, viewH, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.setClearColor(0xeadfca, 1);
}

function setupSceneGraph() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#eadfca');

  const initialPosition = new THREE.Vector3(-280, 235, -420);
  const initialView = getOverviewView();
  const target = new THREE.Vector3(...initialView.target);
  camera = new THREE.PerspectiveCamera(38, viewW / Math.max(1, viewH), 0.2, 3200);
  camera.position.copy(initialPosition);

  controls = new OrbitControls(camera, canvas);
  controls.target.copy(target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.062;
  controls.rotateSpeed = 0.54;
  controls.zoomSpeed = 0.72;
  controls.panSpeed = 0.65;
  controls.screenSpacePanning = false;
  controls.minDistance = 4;
  controls.maxDistance = 1100;
  controls.minPolarAngle = 0.16;
  controls.maxPolarAngle = Math.PI * 0.485;
  controls.enablePan = true;
  controls.update();

  raycaster = new THREE.Raycaster();
  pointerNdc = new THREE.Vector2();
}

function setupIntroCamera() {
  if (reducedMotion || params.get('nointro')) {
    const overview = getOverviewView();
    camera.position.fromArray(overview.position);
    controls.target.fromArray(overview.target);
    camera.fov = overview.fov;
    camera.updateProjectionMatrix();
    controls.update();
    return;
  }
  const targetSpot = params.get('spot');
  if (targetSpot) {
    const spot = LANDMARKS.find((item) => item.id === targetSpot);
    if (spot) {
      const view = getSpotView(spot);
      camera.position.fromArray(view.position);
      controls.target.fromArray(view.target);
      camera.fov = view.fov;
      camera.updateProjectionMatrix();
      controls.update();
      return;
    }
  }
  if (params.get('view') === 'top') {
    const top = getTopView();
    camera.position.fromArray(top.position);
    controls.target.fromArray(top.target);
    camera.fov = top.fov;
    camera.updateProjectionMatrix();
    controls.update();
  }
}

function resolveInitialHour() {
  const requested = parseFloat(params.get('hour'));
  if (Number.isFinite(requested)) return clamp(requested, 6, 20.8);
  return 16.3;
}

function finishBoot() {
  announceCampusFallback(route);
  app.classList.remove('is-loading');
  app.classList.add('is-ready');
  loading.classList.add('is-leaving');
  window.setTimeout(() => {
    loading.hidden = true;
  }, 980);

  maybeAutoStartFilm();
  const targetSpot = params.get('spot');
  const view = params.get('view');
  const delay = reducedMotion || params.get('nointro') ? 0 : 500;
  window.setTimeout(() => {
    if (targetSpot && LANDMARKS.some((item) => item.id === targetSpot)) {
      openSpot(targetSpot, { fromTour: false, duration: reducedMotion ? 0 : 1700, source: 'query' });
      return;
    }
    if (view === 'top') {
      flyTo(getTopView(), reducedMotion ? 0 : 1900);
      return;
    }
    const overview = getOverviewView();
    if (!reducedMotion && !params.get('nointro')) {
      flyTo(overview, 2600);
    } else {
      camera.position.fromArray(overview.position);
      controls.target.fromArray(overview.target);
      camera.fov = overview.fov;
      camera.updateProjectionMatrix();
      controls.update();
    }
  }, delay);
}

/* ------------------------------------------------------------------ */
/*  UI construction                                                    */
/* ------------------------------------------------------------------ */

function setupUI() {
  interactionHint.textContent = coarsePointer
    ? '单指旋转 · 双指缩放 · 轻触建筑'
    : '拖动旋转 · 滚轮缩放 · 点击建筑';

  indexList.innerHTML = '';
  markerLayer.innerHTML = '';
  markerEntries = [];

  LANDMARKS.forEach((spot, i) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'index__item';
    button.dataset.spot = spot.id;
    button.setAttribute('aria-label', `${spot.index} ${spot.name}，${spot.kind}`);
    button.innerHTML = `
      <span class="index__idx">${spot.index}</span>
      <span class="index__name">${spot.name}</span>
    `;
    button.addEventListener('click', () => {
      stopTour();
      openSpot(spot.id, { source: 'index' });
    });
    li.appendChild(button);
    indexList.appendChild(li);

    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'marker';
    marker.dataset.spot = spot.id;
    marker.setAttribute('aria-label', `查看${spot.name}图志`);
    marker.innerHTML = `
      <span class="marker__pin" aria-hidden="true"><i>${spot.index}</i></span>
      <span class="marker__leader" aria-hidden="true"></span>
      <span class="marker__label">
        <span class="marker__num">${spot.index}</span>
        <span class="marker__name">${spot.name}</span>
        <span class="marker__en">${spot.en}</span>
      </span>
    `;
    marker.addEventListener('click', () => {
      stopTour();
      openSpot(spot.id, { source: 'marker' });
    });
    marker.addEventListener('pointerenter', () => {
      if (hasCustomCursor) cursorEl.classList.add('is-hover');
    });
    marker.addEventListener('pointerleave', () => {
      cursorEl.classList.remove('is-hover');
    });
    markerLayer.appendChild(marker);

    markerEntries.push({
      el: marker,
      anchor: new THREE.Vector3(...spot.anchor),
      id: spot.id,
      priority: LANDMARKS.length - i
    });
  });

  const countEl = $('.index__count');
  if (countEl) countEl.textContent = `${String(LANDMARKS.length).padStart(2, '0')} SPOTS`;
  if (introSpotCount) introSpotCount.textContent = `${LANDMARKS.length} 处地景`;
  // 编号区间跟随 LANDMARKS 数量，新增地标时无需再改 index.html。
  if (indexRange) {
    indexRange.textContent = `01—${String(LANDMARKS.length).padStart(2, '0')}`;
  }

  const sources = $('#sourceList');
  if (sources) {
    sources.innerHTML = '';
    SOURCES.forEach((source) => {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      link.textContent = source.label;
      li.appendChild(link);
      sources.appendChild(li);
    });
  }

  syncCampusViews();
  renderCampusSwitcher();
  applyCampusBranding();
  applyFeatureFlags();
}

/* ------------------------------------------------------------------ */
/*  Events                                                             */
/* ------------------------------------------------------------------ */

function setupEvents() {
  window.addEventListener('resize', resize);
  // 真正离开页面时释放天气层；bfcache 恢复（persisted）时不销毁。
  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) {
      disposeFilmLayer();
      disposeWeatherLayer();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) clock.getDelta();
  });

  controls.addEventListener('start', () => {
    cancelCameraTween();
    if (state.tourActive) stopTour();
    markInteracted();
    cursorEl.classList.add('is-down');
  });
  controls.addEventListener('end', () => {
    cursorEl.classList.remove('is-down');
  });

  canvas.addEventListener('pointerdown', (event) => {
    isPointerDown = true;
    pointerStart = { x: event.clientX, y: event.clientY, time: performance.now() };
    markInteracted();
  });
  window.addEventListener('pointerup', (event) => {
    if (!isPointerDown) return;
    isPointerDown = false;
    const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    const duration = performance.now() - pointerStart.time;
    if (event.target === canvas && distance < 7 && duration < 620) {
      handleCanvasClick(event.clientX, event.clientY);
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!hasCustomCursor || event.pointerType !== 'mouse') return;
    const now = performance.now();
    if (now - lastHoverRay < 90 || isPointerDown) return;
    lastHoverRay = now;
    const spot = pickSpot(event.clientX, event.clientY);
    if (spot !== state.hoveredSpot) {
      state.hoveredSpot = spot;
      cursorEl.classList.toggle('is-hover', Boolean(spot));
    }
  });

  canvas.addEventListener('pointerleave', () => {
    state.hoveredSpot = null;
    cursorEl.classList.remove('is-hover');
  });

  $('#closeInfo').addEventListener('click', () => closeSpot({ stop: true }));
  $('#prevSpot').addEventListener('click', () => stepSpot(-1));
  $('#nextSpot').addEventListener('click', () => stepSpot(1));
  $('#quickNextSpot').addEventListener('click', () => stepSpot(1));

  tourButton.addEventListener('click', () => {
    if (state.tourActive) {
      stopTour();
    } else {
      startTour();
    }
  });

  $$('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.action;
      if (action === 'overview') {
        stopTour();
        closeSpot({ stop: false });
        flyTo(getOverviewView(), reducedMotion ? 0 : 1600);
      }
      if (action === 'top') {
        stopTour();
        closeSpot({ stop: false });
        flyTo(getTopView(), reducedMotion ? 0 : 1600);
      }
      if (action === 'reset') {
        stopTour();
        closeSpot({ stop: false });
        applyHour(16.3);
        flyTo(getOverviewView(), reducedMotion ? 0 : 1500);
        showToast('视角与日光已复位');
      }
      if (action === 'about') openAbout();
      if (action === 'night') toggleNight();
    });
  });

  timeRange.addEventListener('input', (event) => {
    markInteracted();
    applyHour(parseFloat(event.target.value));
  });
  timeRange.addEventListener('pointerdown', markInteracted);

  weatherRange.addEventListener('input', (event) => {
    const entry = weatherList()[Number(event.target.value)] || null;
    if (entry) applyWeather(entry.id);
  });
  weatherRange.addEventListener('pointerdown', markInteracted);

  if (filmButton) filmButton.addEventListener('click', () => startFilm());
  if (filmRecordButton) filmRecordButton.addEventListener('click', toggleFilmRecording);
  if (filmExitButton) filmExitButton.addEventListener('click', () => stopFilm());

  $('#fullscreenButton').addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', () => {
    const button = $('#fullscreenButton');
    button.setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '全屏');
    button.classList.toggle('is-active', Boolean(document.fullscreenElement));
    window.setTimeout(resize, 80);
    window.requestAnimationFrame(resize);
  });

  $('#closeAbout').addEventListener('click', closeAbout);
  aboutDialog.addEventListener('click', (event) => {
    if (event.target === aboutDialog) closeAbout();
  });
  aboutDialog.addEventListener('close', () => {
    state.modalOpen = false;
    setModalCursor(false);
  });

  minimap.addEventListener('click', handleMapClick);
  minimap.addEventListener('pointermove', handleMapHover);

  window.addEventListener('keydown', handleKeyDown);

  document.addEventListener('pointermove', handleCustomCursor);
  document.addEventListener('pointerenter', () => cursorEl.classList.add('is-visible'));
  document.addEventListener('pointerleave', () => cursorEl.classList.remove('is-visible'));
  document.addEventListener('pointerover', (event) => {
    if (!hasCustomCursor) return;
    const isControl = event.target.closest && event.target.closest('button, a, input, .marker, #minimap');
    if (isControl) cursorEl.classList.add('is-hover');
  });
  document.addEventListener('pointerout', (event) => {
    if (!hasCustomCursor) return;
    const next = event.relatedTarget;
    if (!next || !next.closest || !next.closest('button, a, input, .marker, #minimap')) {
      cursorEl.classList.remove('is-hover');
    }
  });

  // 校区切换器：委托到 #campusSwitcher（planned 校区按钮为 disabled，点击不会触发）
  const switcher = $('#campusSwitcher');
  if (switcher) {
    switcher.addEventListener('click', (event) => {
      const button = event.target.closest ? event.target.closest('[data-campus]') : null;
      if (!button || button.disabled) return;
      const id = button.dataset.campus;
      if (!id || id === ACTIVE_CAMPUS.id) return;
      switchCampus(id);
    });
  }
}

function markInteracted() {
  app.classList.add('has-interacted');
}

function handleCustomCursor(event) {
  cursorTarget.x = event.clientX;
  cursorTarget.y = event.clientY;
  if (!hasCustomCursor) return;
  cursorEl.classList.add('is-visible');
  if (cursorPos.x === 0 && cursorPos.y === 0) {
    cursorPos.x = event.clientX;
    cursorPos.y = event.clientY;
  }
  cursorEl.style.left = `${event.clientX}px`;
  cursorEl.style.top = `${event.clientY}px`;
}

function handleKeyDown(event) {
  if (state.modalOpen) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  if (film?.isPlaying?.()) {
    if (event.key === 'Escape') stopFilm();
    return;
  }
  if (event.key === 'Escape') {
    if (state.tourActive) {
      stopTour();
      return;
    }
    if (state.activeId) closeSpot({ stop: true });
    return;
  }
  if (/^[1-8]$/.test(event.key)) {
    const spot = LANDMARKS[Number(event.key) - 1];
    if (spot) {
      stopTour();
      openSpot(spot.id, { source: 'keyboard' });
    }
    return;
  }
  if (event.key.toLowerCase() === 't') {
    if (state.tourActive) stopTour();
    else startTour();
  }
  if (event.key.toLowerCase() === 'o') {
    stopTour();
    closeSpot({ stop: false });
    flyTo(getOverviewView(), reducedMotion ? 0 : 1500);
  }
  if (event.key.toLowerCase() === 'f') {
    toggleFullscreen();
  }
}

function toggleFullscreen() {
  const target = stageEl || document.documentElement;
  if (!document.fullscreenElement) {
    target.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/*  Selection, info, tour                                              */
/* ------------------------------------------------------------------ */

function openSpot(id, options = {}) {
  const spot = LANDMARKS.find((item) => item.id === id);
  if (!spot) return;
  if (film?.isPlaying?.()) stopFilm({ silent: true });
  if (!options.fromTour) stopTour();
  markInteracted();
  state.activeId = id;

  infoNumber.textContent = `${spot.index} / ${String(LANDMARKS.length).padStart(2, '0')}`;
  infoKind.textContent = spot.kind;
  infoTitle.textContent = spot.name;
  infoEn.textContent = spot.en;
  infoSummary.textContent = spot.summary;
  infoDescription.textContent = spot.description;
  infoFacts.innerHTML = spot.facts
    .map(([label, value]) => `<div class="fact"><dt>${label}</dt><dd>${value}</dd></div>`)
    .join('');
  infoDrawing.innerHTML = diagramSVG(spot.diagram);
  infoCard.scrollTop = 0;

  app.classList.add('is-panel-open');
  infoCard.setAttribute('aria-hidden', 'false');
  updateSceneHeading(spot);
  updateActiveUI(id);
  campus.setSelection(id);
  queueRevealSpot({ fromTour: Boolean(options.fromTour) });

  if (options.fly !== false) {
    const duration =
      options.duration !== undefined ? options.duration : reducedMotion ? 0 : 1850;
    flyTo(getSpotView(spot), duration);
  }
}

function closeSpot({ stop = true } = {}) {
  if (stop) stopTour();
  state.activeId = null;
  app.classList.remove('is-panel-open');
  infoCard.setAttribute('aria-hidden', 'true');
  updateSceneHeading(null);
  updateActiveUI(null);
  campus.hideSelection();
  window.clearTimeout(state.revealTimer);
  if (isPhoneLayout()) {
    if (stageEl) {
      const stageTop = stageEl.getBoundingClientRect().top + window.scrollY - 68;
      if (window.scrollY > stageTop + 24) {
        window.scrollTo({ top: Math.max(0, stageTop), behavior: reducedMotion ? 'auto' : 'smooth' });
      }
    }
  } else if (narrativeEl) {
    narrativeEl.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  }
}

function updateSceneHeading(spot) {
  const campusShort = ACTIVE_CAMPUS.shortName || ACTIVE_CAMPUS.name || '校园';
  const campusEn = ACTIVE_CAMPUS.en || 'CAMPUS ATLAS';
  if (sceneTitleEl) sceneTitleEl.textContent = spot ? spot.name : `${campusShort}校园`;
  if (sceneEnEl) sceneEnEl.textContent = spot ? spot.en : campusEn;
  if (sceneKindEl) sceneKindEl.textContent = spot ? spot.kind : '自由探索';
}

/**
 * The info card lives in the narrative column. Reveal it without covering the
 * scene: on desktop only scroll the column when the card does not fit; on
 * phones scroll the single-column page to the card.
 */
function queueRevealSpot({ fromTour = false } = {}) {
  window.clearTimeout(state.revealTimer);
  state.revealTimer = window.setTimeout(() => {
    if (!state.activeId) return;
    if (isPhoneLayout()) {
      if (fromTour) return;
      infoCard.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
      return;
    }
    if (!narrativeEl) return;
    const containerRect = narrativeEl.getBoundingClientRect();
    const cardRect = infoCard.getBoundingClientRect();
    if (cardRect.bottom - containerRect.bottom > 8) {
      const top = narrativeEl.scrollTop + cardRect.top - containerRect.top - 2;
      narrativeEl.scrollTo({ top, behavior: reducedMotion ? 'auto' : 'smooth' });
    }
  }, reducedMotion ? 0 : 240);
}

function updateActiveUI(id) {
  $$('.index__item').forEach((item) => {
    const active = item.dataset.spot === id;
    item.classList.toggle('is-active', active);
    if (active) item.setAttribute('aria-current', 'true');
    else item.removeAttribute('aria-current');
  });
  markerEntries.forEach((entry) => {
    entry.el.classList.toggle('is-active', entry.id === id);
    entry.el.classList.toggle('is-muted', Boolean(id) && entry.id !== id);
  });
}

function stepSpot(direction) {
  if (!state.activeId) return;
  const current = LANDMARKS.findIndex((item) => item.id === state.activeId);
  const next = (current + direction + LANDMARKS.length) % LANDMARKS.length;
  stopTour();
  openSpot(LANDMARKS[next].id, { source: 'pager' });
}

function startTour() {
  if (state.tourActive) return;
  if (film?.isPlaying?.()) stopFilm({ silent: true });
  state.tourActive = true;
  state.tourIndex = 0;
  app.classList.add('is-touring');
  tourButton.setAttribute('aria-pressed', 'true');
  tourLabel.textContent = '暂停导览';
  openSpot(TOUR_ORDER[0], { fromTour: true, duration: reducedMotion ? 0 : 2200 });
  scheduleTourStep();
  showToast(`自动导览 · ${String(TOUR_ORDER.length).padStart(2, '0')} 处校园地景`);
}

function scheduleTourStep() {
  if (state.tourTimer) window.clearTimeout(state.tourTimer);
  state.tourTimer = window.setTimeout(() => {
    if (!state.tourActive) return;
    state.tourIndex += 1;
    if (state.tourIndex >= TOUR_ORDER.length) {
      stopTour(false);
      showToast('导览结束 · 可自由漫游');
      return;
    }
    openSpot(TOUR_ORDER[state.tourIndex], { fromTour: true, duration: reducedMotion ? 0 : 2100 });
    scheduleTourStep();
  }, reducedMotion ? 3600 : 6800);
}

function stopTour(showMessage = false) {
  if (state.tourTimer) {
    window.clearTimeout(state.tourTimer);
    state.tourTimer = null;
  }
  if (!state.tourActive) return;
  state.tourActive = false;
  app.classList.remove('is-touring');
  tourButton.setAttribute('aria-pressed', 'false');
  tourLabel.textContent = '自动导览';
  if (showMessage) showToast('导览已暂停');
}

/* ------------------------------------------------------------------ */
/*  Multi-campus UI, branding & switching                              */
/* ------------------------------------------------------------------ */

function syncCampusViews() {
  desktopOverview = buildDesktopOverview(ACTIVE_CAMPUS);
  document.documentElement.dataset.campus = ACTIVE_CAMPUS.id;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]));
}

function campusYearRange(campusEntry) {
  return campusEntry.founded ? `${campusEntry.founded}—2026` : '—';
}

/** planned 校区的状态词：「未绘制」（另一校区尚未建模）或「未上线」。 */
function plannedCampusState(campusEntry) {
  return campusEntry?.note?.includes('未绘制') ? '未绘制' : '未上线';
}

/** planned 校区的展示名：name 已是「…校区」时不重复后缀。 */
function campusDisplayName(campusEntry) {
  const name = campusEntry?.name || '该校区';
  return /校区$/.test(name) ? name : `${name}校区`;
}

/** planned 校区的完整提示文案，如「初中部校区尚未绘制」。 */
function plannedCampusMessage(campusEntry) {
  const state = plannedCampusState(campusEntry);
  return `${campusDisplayName(campusEntry)}尚未${state.replace(/^未/, '')}`;
}

/** 品牌文案数据化：按当前 campus 元信息写回 index.html 的 data-campus-slot 节点。 */
function applyCampusBranding() {
  const campusEntry = ACTIVE_CAMPUS;
  const shortName = campusEntry.shortName || campusEntry.name || '校园';
  const school = campusEntry.school || '';
  const division = campusEntry.division || '';
  const city = campusEntry.location?.city || '';
  const cityShort = city ? `${city} · ${shortName}` : shortName;
  const cityEn = city === '海口' ? 'HAIKOU' : city;
  const yearRange = campusYearRange(campusEntry);
  // 「本图志仅绘制…」的说明：只绘制当前学段校区，未绘制的兄弟校区点名（如初中部）。
  const drawnScope = division ? `${division}（${campusEntry.name}）` : campusEntry.name;
  const unbuiltSiblings = CAMPUS_LIST.filter(
    (item) =>
      item.id !== campusEntry.id &&
      item.status !== 'active' &&
      item.note?.includes('未绘制')
  ).map((item) => campusDisplayName(item));
  const campusScope =
    `本图志仅绘制${drawnScope}` +
    (unbuiltSiblings.length ? `；${unbuiltSiblings.join('、')}尚未绘制` : '') +
    '。';
  const slots = {
    fullName: [school, campusEntry.name].filter(Boolean).join(' · '),
    loadingYears: `三维校园图志 / ${yearRange}`,
    schoolEnShortEn: [campusEntry.schoolEn || school, campusEntry.shortEn].filter(Boolean).join(' · '),
    loadingTitle: `${escapeHtml(shortName)}<span>校园图志</span>`,
    brandName: `${shortName}校园图志`,
    brandSub: `${school} · ${campusEntry.name}${division ? `（${division}）` : ''} / A CAMPUS ATLAS`,
    introEyebrow: [campusEntry.shortEn, cityEn].filter(Boolean).join(', ') + ` · ${shortName}`,
    shortName,
    introLead: `把一座校园，读成一张可以行走的图。以建筑为线索，在体量与光影之间，重访${
      division ? `${school}${division}` : campusEntry.name
    }的日常。`,
    yearRange,
    cityShortName: cityShort,
    canvasLabel: `${school}${campusEntry.name}交互三维模型。可拖动旋转、滚轮缩放，点击建筑查看图志。`,
    aboutLead: `这不是一张测绘地图，而是一份以建筑为线索的校园阅读。拖动、靠近、点击，在体量与光影之间，重访${
      division ? `${school}${division}` : campusEntry.name
    }的日常。`,
    campusScope,
    fullEn: [campusEntry.schoolEn, campusEntry.en].filter(Boolean).join(' · ')
  };
  document.querySelectorAll('[data-campus-slot]').forEach((element) => {
    const slot = element.dataset.campusSlot;
    const value = slots[slot];
    if (value === undefined) return;
    if (slot === 'loadingTitle') element.innerHTML = value;
    else if (slot === 'canvasLabel') element.setAttribute('aria-label', value);
    else element.textContent = value;
  });
  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) {
    metaDescription.setAttribute(
      'content',
      `${school}${campusEntry.name}${division ? `（${division}）` : ''}交互三维校园图志。${campusEntry.summary || ''}`
    );
  }
  document.title = `${shortName}校园图志 · ${school}三维校园`;
}

/** 能力位：features 全为 true 的府城校区不产生任何视觉变化。 */
function applyFeatureFlags() {
  const features = ACTIVE_CAMPUS.features || {};
  const setHidden = (selector, visible) => {
    const element = document.querySelector(selector);
    if (element) element.hidden = !visible;
  };
  setHidden('.light-panel', features.weather !== false);
  setHidden('#nightButton', features.weather !== false);
  setHidden('#tourButton', features.tour !== false);
  setHidden('#filmButton', features.tour !== false);
  setHidden('.map-panel', features.minimap !== false);
  setHidden('#markers', features.labels !== false);
  if (controls) controls.enabled = features.walk !== false;
}

/** 按注册表渲染校区切换器：保留 #campusSwitcher / [data-campus] DOM 契约。 */
function renderCampusSwitcher() {
  const nav = $('#campusSwitcher');
  if (!nav) return;
  const tabs = $('.campus-switcher__tabs', nav);
  if (!tabs) return;
  tabs.innerHTML = '';
  for (const campusEntry of CAMPUS_LIST) {
    const isActive = campusEntry.id === ACTIVE_CAMPUS.id;
    const isPlanned = campusEntry.status !== 'active';
    // planned 后缀区分「未绘制」（初中部：另一校区尚未建模）与「未上线」（美伦）。
    const plannedSuffix = isPlanned ? `（${plannedCampusState(campusEntry)}）` : '';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `campus-tab${isActive ? ' is-active' : ''}${isPlanned ? ' is-planned' : ''}`;
    button.dataset.campus = campusEntry.id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(isActive));
    if (isActive) button.setAttribute('aria-current', 'true');
    if (isPlanned) {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
      button.title = `${campusEntry.name}${plannedSuffix}`;
    }
    const name = document.createElement('span');
    name.className = 'campus-tab__name';
    name.textContent = `${campusEntry.name}${plannedSuffix}`;
    const en = document.createElement('span');
    en.className = 'campus-tab__en mono';
    en.textContent = campusEntry.shortEn || campusEntry.en || '';
    button.append(name, en);
    tabs.appendChild(button);
  }
}

/** 生成本地 URL（pathname + 规范查询串 + hash），供 history.replaceState 使用。 */
function canonicalCampusUrl(campusId) {
  const search = buildCampusSearch(campusId, window.location.search);
  const query = new URLSearchParams(search);
  const spot = query.get('spot');
  if (spot && !LANDMARKS.some((item) => item.id === spot)) query.delete('spot');
  const suffix = query.toString();
  return `${window.location.pathname}${suffix ? `?${suffix}` : ''}${window.location.hash}`;
}

/** 未知 / planned 校区的回退提示 + URL 规范化（?campus= 契约）。 */
function announceCampusFallback(resolvedRoute) {
  if (resolvedRoute.fallback && resolvedRoute.param) {
    const requested = resolvedRoute.requestedId
      ? CAMPUS_LIST.find((campusEntry) => campusEntry.id === resolvedRoute.requestedId)
      : null;
    showToast(
      resolvedRoute.reason === 'planned'
        ? `${plannedCampusMessage(requested)}，先为你展示${ACTIVE_CAMPUS.name}`
        : `未知校区「${resolvedRoute.param}」，已回到${ACTIVE_CAMPUS.name}`
    );
  }
  const canonical = canonicalCampusUrl(ACTIVE_CAMPUS.id);
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (canonical !== current) history.replaceState(null, '', canonical);
}

/**
 * 切换校区（当前只有府城一个 active 校区，此路径用于未来扩展）。
 * 流程：停止导览/关闭图志 → dispose 旧场景 → 切换数据绑定 → 重建 UI/品牌 →
 * 构建新场景 → 重置相机与日照 → 规范化 URL → toast。
 */
function switchCampus(nextId) {
  if (state.switching) return;
  const resolved = resolveCampus(nextId);
  if (resolved.fallback) {
    const requested = CAMPUS_LIST.find((campusEntry) => campusEntry.id === resolved.requestedId);
    showToast(
      resolved.reason === 'planned'
        ? plannedCampusMessage(requested)
        : `未知校区「${nextId}」`
    );
    return;
  }
  const next = resolved.campus;
  if (next.id === ACTIVE_CAMPUS.id) return;
  state.switching = true;
  try {
    stopTour();
    closeSpot({ stop: true });
    cancelCameraTween();
    disposeFilmLayer();
    disposeWeatherLayer();
    if (campus) {
      campus.dispose?.();
      campus = null;
    }
    ACTIVE_CAMPUS = next;
    SITE = next.site;
    LANDMARKS = next.landmarks;
    TOUR_ORDER = next.tourOrder;
    SOURCES = next.sources;
    state.campusId = next.id;
    state.activeId = null;
    state.tourIndex = -1;
    syncCampusViews();
    setupUI();
    updateSceneHeading(null);
    campus = buildCampus(scene, renderer, {
      campus: ACTIVE_CAMPUS,
      site: SITE,
      landmarks: LANDMARKS,
      theme: ACTIVE_CAMPUS.theme,
      reducedMotion
    });
    // 旧天气层已随旧校区 dispose；新校区重建后恢复当前天气再校准时刻。
    weather = createWeatherLayer();
    applyWeather(state.weatherId, { silent: true });
    // 影片控制器绑定 campus.interiorCameras，重建后重新创建。
    film = createFilmLayer();
    applyHour(resolveInitialHour(), { silent: true });
    resize();
    const overview = getOverviewView();
    camera.position.fromArray(overview.position);
    controls.target.fromArray(overview.target);
    camera.fov = overview.fov;
    camera.updateProjectionMatrix();
    controls.update();
    renderer.shadowMap.needsUpdate = true;
    history.replaceState(null, '', canonicalCampusUrl(next.id));
    showToast(`已切换至${next.fullName ?? next.name}`);
  } finally {
    state.switching = false;
  }
}

/* ------------------------------------------------------------------ */
/*  Camera                                                             */
/* ------------------------------------------------------------------ */

function flyTo(view, duration = 1600) {
  const targetPos = new THREE.Vector3(...(view.position || view.camera.position));
  const targetLook = new THREE.Vector3(...(view.target || view.camera.target));
  const fov = view.fov || (view.camera && view.camera.fov) || camera.fov;
  if (duration <= 0 || reducedMotion) {
    camera.position.copy(targetPos);
    controls.target.copy(targetLook);
    camera.fov = fov;
    camera.updateProjectionMatrix();
    controls.update();
    return;
  }
  cameraTween = {
    fromPos: camera.position.clone(),
    toPos: targetPos,
    fromTarget: controls.target.clone(),
    toTarget: targetLook,
    fromFov: camera.fov,
    toFov: fov,
    start: performance.now(),
    duration
  };
}

function updateCameraTween(now) {
  if (!cameraTween) return;
  const t = clamp((now - cameraTween.start) / cameraTween.duration, 0, 1);
  const eased = t < 0.5 ? 8 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2;
  camera.position.lerpVectors(cameraTween.fromPos, cameraTween.toPos, eased);
  const lift =
    Math.sin(Math.PI * eased) *
    Math.min(12, cameraTween.fromPos.distanceTo(cameraTween.toPos) * 0.075);
  camera.position.y += lift;
  controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, eased);
  camera.fov = THREE.MathUtils.lerp(cameraTween.fromFov, cameraTween.toFov, eased);
  camera.updateProjectionMatrix();
  if (t === 1) cameraTween = null;
}

function cancelCameraTween() {
  cameraTween = null;
}

/* ------------------------------------------------------------------ */
/*  Raycasting                                                         */
/* ------------------------------------------------------------------ */

function setPointerNdc(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
}

function pickSpot(clientX, clientY) {
  if (!campus) return null;
  setPointerNdc(clientX, clientY);
  raycaster.setFromCamera(pointerNdc, camera);
  const hits = raycaster.intersectObjects(campus.pickables, false);
  for (const hit of hits) {
    if (hit.object.userData.spot) return hit.object.userData.spot;
  }
  return null;
}

function handleCanvasClick(clientX, clientY) {
  const spot = pickSpot(clientX, clientY);
  if (spot) {
    stopTour();
    openSpot(spot, { source: 'scene' });
    return;
  }
  // Clicking empty space dismisses an open card without changing the view.
  if (state.activeId) closeSpot({ stop: true });
}

/* ------------------------------------------------------------------ */
/*  Daylight                                                           */
/* ------------------------------------------------------------------ */

function applyHour(nextHour, options = {}) {
  if (!campus) return;
  const hour = clamp(nextHour, 6, 20.8);
  state.hour = hour;
  if (hour < 18.3) state.dayHour = hour;
  timeRange.value = String(hour);
  campus.setTime(hour);
  if (renderer) renderer.shadowMap.needsUpdate = true;
  const night = campus.getNight() > 0.35;
  state.isNight = night;
  document.body.dataset.night = String(night);
  nightButton.setAttribute('aria-pressed', String(night));
  nightButton.setAttribute('aria-label', night ? '切换到白昼' : '切换到暮色');

  const totalMinutes = Math.round(hour * 60);
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const mm = String(totalMinutes % 60).padStart(2, '0');
  const timeText = `${hh}:${mm}`;
  timeReadout.textContent = timeText;
  clockLabel.textContent = timeText;

  const phase = describePhase(hour);
  phaseLabel.textContent = phase.cn;
  lightState.textContent = phase.light;
  lightPhase.textContent = phase.en;
  weather?.setHour?.(hour);
  if (!options.silent) markInteracted();
}

function describePhase(hour) {
  if (hour < 7.2) return { cn: '晨光', en: 'MORNING', light: '清晨微光' };
  if (hour < 11.2) return { cn: '上午', en: 'MORNING', light: '清透日光' };
  if (hour < 14) return { cn: '正午', en: 'MIDDAY', light: '正午直射' };
  if (hour < 17.2) return { cn: '斜阳', en: 'GOLDEN HOUR', light: '斜阳暖照' };
  if (hour < 18.4) return { cn: '暮色', en: 'TWILIGHT', light: '暮色将至' };
  if (hour < 19.5) return { cn: '入夜', en: 'BLUE HOUR', light: '华灯初上' };
  return { cn: '夜色', en: 'NIGHT', light: '灯火校园' };
}

function toggleNight() {
  if (state.isNight) {
    applyHour(state.dayHour >= 7 && state.dayHour < 18.2 ? state.dayHour : 16.3);
    showToast('白昼 · 南国日光');
  } else {
    state.dayHour = state.hour;
    applyHour(19.65);
    showToast('暮色 · 华灯初上');
  }
}

/* ------------------------------------------------------------------ */
/*  Weather                                                            */
/*  契约：js/weather.js 导出 WEATHERS 与 createWeather；本文件只负责面板   */
/*  滑杆状态、文案与场景层生命周期。所有引擎调用都用可选链保护，引擎缺失    */
/*  或抛错时昼夜系统与页面其余部分照常工作。                               */
/* ------------------------------------------------------------------ */

/** 单色字符符号（避免彩色 emoji 破坏暖纸色设计语言）。 */
const WEATHER_ICONS = {
  clear: '☀︎',
  'light-rain': '☂︎',
  'heavy-rain': '☔︎',
  typhoon: '◎',
  thunder: '⚡︎',
  snow: '❄︎'
};

const DEFAULT_WEATHER_ID = 'clear';

/** ?weather=<id> 的初始天气；未知值静默回退 clear，与 ?hour / ?spot 兼容。 */
function resolveInitialWeather() {
  const requested = (params.get('weather') || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
  if (!requested) return DEFAULT_WEATHER_ID;
  const match = WEATHERS.find((item) => item && item.id === requested);
  return match ? match.id : DEFAULT_WEATHER_ID;
}

function weatherList() {
  return Array.isArray(WEATHERS) ? WEATHERS.filter(Boolean) : [];
}

/** 场景天气层（js/weather.js）；失败时降级为 null，不影响昼夜系统。 */
function createWeatherLayer() {
  if (!scene || !renderer || !camera || !campus?.world) return null;
  try {
    return createWeather({
      scene,
      renderer,
      camera,
      controls,
      site: SITE,
      world: campus.world
    });
  } catch (error) {
    console.warn('Weather layer failed to initialise:', error);
    return null;
  }
}

function disposeWeatherLayer() {
  try {
    weather?.dispose?.();
  } catch (error) {
    console.warn('Weather layer failed to dispose:', error);
  }
  weather = null;
}

/**
 * 切换天气：同步场景层 + 面板文案/滑杆/无障碍值。
 * @param {string} id WEATHERS 里的天气 id；未知值回退 clear。
 */
function applyWeather(id, options = {}) {
  const list = weatherList();
  if (!list.length) return;
  const entry =
    list.find((item) => item.id === id) ||
    list.find((item) => item.id === DEFAULT_WEATHER_ID) ||
    list[0];
  state.weatherId = entry.id;
  try {
    weather?.setWeather?.(entry.id);
  } catch (error) {
    console.warn('Weather layer failed to switch:', error);
  }
  // 场景层天气行为（js/campus-accurate.js 的 setWeather：学生打伞/躲雨等）；
  // 切校区/未就绪时用可选链保护，晚于本文件交付也不会崩。
  try {
    campus?.setWeather?.(entry.id);
  } catch (error) {
    console.warn('Campus weather behaviour failed to switch:', error);
  }
  const index = Math.max(0, list.indexOf(entry));
  const total = list.length;
  weatherRange.value = String(index);
  weatherRange.setAttribute('aria-valuetext', `${entry.name} ${entry.en}`);
  weatherIcon.textContent = WEATHER_ICONS[entry.id] || '·';
  weatherName.textContent = entry.name;
  weatherEn.textContent = entry.en;
  weatherPhase.textContent = `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
  if (!options.silent) markInteracted();
}

/* ------------------------------------------------------------------ */
/*  Film · guided campus tour + WebM recording                         */
/*  影片本身在 js/film.js 里编排运镜；这里只做：UI 状态、开关、录制下载、   */
/*  URL 参数与「播放时暂停导览/关闭图志/接管相机」的生命周期。              */
/* ------------------------------------------------------------------ */

/** 创建影片控制器；campus 重建后需要重新创建（室内机位随之更新）。 */
function createFilmLayer() {
  if (!scene || !camera || !controls || !renderer || !campus) return null;
  try {
    return createFilm({
      scene,
      camera,
      controls,
      renderer,
      campus,
      onStateChange: handleFilmState
    });
  } catch (error) {
    console.warn('Film failed to initialise:', error);
    return null;
  }
}

function disposeFilmLayer() {
  try {
    film?.dispose?.();
  } catch (error) {
    console.warn('Film failed to dispose:', error);
  }
  film = null;
  state.filmActive = false;
  state.filmRecording = false;
  app.classList.remove('is-filming');
  if (filmWash) filmWash.style.opacity = '0';
  if (filmLayer) filmLayer.setAttribute('aria-hidden', 'true');
}

/** 影片状态快照 → DOM。只在数值变化时写 DOM，避免每帧重排。 */
function handleFilmState(next = {}) {
  if (!filmLayer) return;
  const wasActive = state.filmActive;
  const active = Boolean(next.playing);
  state.filmActive = active;
  state.filmRecording = Boolean(next.recording);
  app.classList.toggle('is-filming', active);
  filmLayer.setAttribute('aria-hidden', active ? 'false' : 'true');

  if (next.title && filmTitleEl && filmTitleEl.textContent !== next.title) {
    filmTitleEl.textContent = next.title;
  }
  if (next.index !== undefined && next.index !== filmUiCache.index) {
    filmUiCache.index = next.index;
    if (filmCaptionEl) filmCaptionEl.textContent = next.caption || '';
    if (filmCaptionEnEl) filmCaptionEnEl.textContent = next.en || '';
  }
  if (next.duration && Math.abs(next.duration - filmUiCache.duration) > 0.01) {
    filmUiCache.duration = next.duration;
    if (filmDurationEl) filmDurationEl.textContent = formatFilmClock(next.duration);
    if (filmMetaTitleEl) filmMetaTitleEl.textContent = `${FILM_TITLE} · ${formatFilmClock(next.duration)}`;
  }
  const seconds = Math.max(0, Math.floor(next.time || 0));
  if (seconds !== filmUiCache.seconds) {
    filmUiCache.seconds = seconds;
    if (filmTimeEl) filmTimeEl.textContent = formatFilmClock(seconds);
  }
  const progress = clamp(Number(next.progress) || 0, 0, 1);
  if (filmProgressFill) {
    filmProgressFill.style.transform = `scaleX(${progress.toFixed(4)})`;
  }
  if (filmProgressBar) {
    filmProgressBar.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
  }
  if (filmWash) {
    const wash = active ? clamp(Number(next.wash) || 0, 0, 1) : 0;
    filmWash.style.opacity = wash.toFixed(3);
  }
  if (filmRecEl) filmRecEl.hidden = !state.filmRecording;
  if (filmRecordButton) {
    filmRecordButton.textContent = state.filmRecording ? '停止录制并下载' : '录制并下载';
    filmRecordButton.setAttribute('aria-pressed', String(state.filmRecording));
  }
  if (active && !wasActive) markInteracted();
  if (next.ended) {
    showToast('影片播放完毕 · 可自由漫游');
    if (state.filmRecording) {
      finishRecording({ autoDownload: params.get('record') === '1' });
    }
  }
}

/** 秒数 → mm:ss（影片 HUD 的时间码）。 */
function formatFilmClock(seconds) {
  const safe = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function downloadFilmBlob(blob) {
  if (!blob || !blob.size) {
    showToast('录制失败 · 未获取到视频数据');
    return false;
  }
  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '府城校园图志-巡游.webm';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast('影片已开始下载 · 府城校园图志-巡游.webm');
    return true;
  } catch (error) {
    console.warn('Film download failed:', error);
    showToast('影片下载失败');
    return false;
  }
}

/** 停止录制并（可选）下载；返回 Promise<Blob|null>，供调试/自动出片复用。 */
function finishRecording({ autoDownload = true } = {}) {
  if (!film?.recordStop) return Promise.resolve(null);
  return film
    .recordStop()
    .then((blob) => {
      state.filmRecording = false;
      if (filmRecEl) filmRecEl.hidden = true;
      if (filmRecordButton) {
        filmRecordButton.textContent = '录制并下载';
        filmRecordButton.setAttribute('aria-pressed', 'false');
      }
      if (autoDownload) downloadFilmBlob(blob);
      return blob;
    })
    .catch((error) => {
      console.warn('Film recording failed to stop:', error);
      return null;
    });
}

function startFilm(options = {}) {
  if (!campus) return false;
  if (!film) film = createFilmLayer();
  if (!film) {
    showToast('影片模块不可用');
    return false;
  }
  stopTour();
  if (state.activeId) closeSpot({ stop: false });
  cancelCameraTween();
  filmUiCache = { index: -1, seconds: -1, duration: -1, recording: null };
  // 移动端：把场景卡片滚到视口内，避免影片在屏幕外播放。
  if (isPhoneLayout() && stageEl) {
    const top = stageEl.getBoundingClientRect().top + window.scrollY - 66;
    if (window.scrollY > top + 20) {
      window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion ? 'auto' : 'smooth' });
    }
  }
  const started = film.start({ restart: true });
  if (!started) return false;
  if (options.record) {
    const ok = film.recordStart();
    if (!ok) showToast('当前浏览器不支持影片录制');
    else state.filmRecording = true;
  }
  return true;
}

function stopFilm(options = {}) {
  if (!film?.isPlaying?.()) return false;
  const wasRecording = state.filmRecording;
  film.stop();
  state.filmActive = false;
  state.filmRecording = false;
  app.classList.remove('is-filming');
  if (filmLayer) filmLayer.setAttribute('aria-hidden', 'true');
  if (wasRecording) finishRecording({ autoDownload: options.download === true });
  if (!options.silent) showToast('已退出影片 · 视角已恢复');
  return true;
}

/** 影片 HUD 的「录制并下载 / 停止录制并下载」按钮。 */
function toggleFilmRecording() {
  if (!film) return;
  if (state.filmRecording) {
    finishRecording({ autoDownload: true });
    return;
  }
  const ok = film.recordStart();
  if (!ok) {
    showToast('当前浏览器不支持影片录制');
    return;
  }
  state.filmRecording = true;
  if (filmRecEl) filmRecEl.hidden = false;
  if (filmRecordButton) {
    filmRecordButton.textContent = '停止录制并下载';
    filmRecordButton.setAttribute('aria-pressed', 'true');
  }
  // 从片头重新播放，保证录到完整巡游。
  film.start({ restart: true });
  showToast('开始录制 · 影片将从头播放');
}

/**
 * ?film=1 → 自动放映；?record=1 → 自动放映并录制，结束时自动下载。
 * 与 ?hour / ?spot / ?weather / ?campus 兼容（其余参数照旧生效）。
 */
function maybeAutoStartFilm() {
  const wantsRecord = params.get('record') === '1' || params.get('record') === 'true';
  const wantsFilm = wantsRecord || params.get('film') === '1' || params.get('film') === 'true';
  if (!wantsFilm) return;
  const delay = reducedMotion ? 700 : 1400;
  window.setTimeout(() => {
    if (!campus || film?.isPlaying?.()) return;
    if (!film) film = createFilmLayer();
    startFilm({ record: wantsRecord });
  }, delay);
}

/* ------------------------------------------------------------------ */
/*  Markers & map                                                      */
/* ------------------------------------------------------------------ */

function updateMarkers() {
  if (!campus || !markerEntries.length || !viewW || !viewH) return;
  const width = viewW;
  const height = viewH;
  const cameraDir = camera.getWorldDirection(new THREE.Vector3());
  const visible = [];

  for (const entry of markerEntries) {
    // 编号 marker 默认全部隐藏，只显示当前选中地标的那一个（点击建筑/索引/导览时出现）。
    const isHidden = entry.id !== state.activeId;
    if (entry.hidden !== isHidden) {
      entry.hidden = isHidden;
      entry.el.classList.toggle('is-spot-hidden', isHidden);
      entry.el.tabIndex = isHidden ? -1 : 0;
      if (isHidden) entry.el.setAttribute('aria-hidden', 'true');
      else entry.el.removeAttribute('aria-hidden');
    }

    const world = entry.anchor;
    const toPoint = new THREE.Vector3().subVectors(world, camera.position);
    const inFront = toPoint.dot(cameraDir) > 0;
    const projected = world.clone().project(camera);
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (-projected.y * 0.5 + 0.5) * height;
    const onScreen =
      inFront && projected.z < 1 && x > -80 && x < width + 80 && y > -60 && y < height + 60;

    entry.el.classList.toggle('is-behind', !onScreen);
    if (!onScreen) {
      entry.screen = null;
      entry.el.classList.remove('is-label-hidden');
      continue;
    }
    entry.screen = { x, y };
    entry.el.style.left = `${x}px`;
    entry.el.style.top = `${y}px`;
    entry.el.classList.toggle('is-left', x > width * 0.55);
    if (!isHidden) visible.push(entry);
  }

  // A small label-collision pass keeps the overview legible.
  visible.sort((a, b) => {
    if (a.id === state.activeId) return -1;
    if (b.id === state.activeId) return 1;
    return b.priority - a.priority;
  });
  const occupied = [];
  const pad = 5;
  for (const entry of visible) {
    const nameEl = entry.el.querySelector('.marker__name');
    const nameLen = nameEl ? nameEl.textContent.trim().length : 4;
    const labelW = Math.round(26 + nameLen * 12);
    const labelH = 23;
    const isLeft = entry.el.classList.contains('is-left');
    const x = entry.screen.x + (isLeft ? -labelW - 20 : 20);
    const y = entry.screen.y - labelH / 2;
    const overlaps = occupied.some(
      (box) =>
        x - pad < box.x + box.w &&
        x + labelW + pad > box.x &&
        y - pad < box.y + box.h &&
        y + labelH + pad > box.y
    );
    if (overlaps && entry.id !== state.activeId) {
      entry.el.classList.add('is-label-hidden');
    } else {
      entry.el.classList.remove('is-label-hidden');
      occupied.push({ x, y, w: labelW, h: labelH });
    }
  }
}

function resizeMap() {
  if (!minimap) return;
  const rect = minimap.getBoundingClientRect();
  mapW = Math.max(0, rect.width);
  mapH = Math.max(0, rect.height);
  mapDpr = Math.min(window.devicePixelRatio || 1, 2);
  minimap.width = Math.max(1, Math.round(mapW * mapDpr));
  minimap.height = Math.max(1, Math.round(mapH * mapDpr));
  drawMap();
}

function mapTransform() {
  const pad = 12;
  const w = SITE.bounds.xMax - SITE.bounds.xMin;
  const h = SITE.bounds.zMax - SITE.bounds.zMin;
  const s = Math.min((mapW - pad * 2) / w, (mapH - pad * 2) / h);
  const cx = (SITE.bounds.xMin + SITE.bounds.xMax) / 2;
  const cz = (SITE.bounds.zMin + SITE.bounds.zMax) / 2;
  return {
    s,
    px: (x) => mapW / 2 + (x - cx) * s,
    py: (z) => mapH / 2 + (z - cz) * s
  };
}

function drawMap() {
  if (!mapW || !mapH || !campus) return;
  const ctx = minimap.getContext('2d');
  if (!ctx) return;
  const css = getComputedStyle(document.body);
  const ink = css.getPropertyValue('--ink').trim() || '#18261f';
  const accent = css.getPropertyValue('--accent').trim() || '#b34c31';
  const muted = css.getPropertyValue('--muted').trim() || '#677067';
  const paper = css.getPropertyValue('--paper').trim() || '#f2e9da';
  const t = mapTransform();

  ctx.setTransform(mapDpr, 0, 0, mapDpr, 0, 0);
  ctx.clearRect(0, 0, mapW, mapH);
  ctx.fillStyle = alphaColor(paper, 0.18);
  ctx.fillRect(0, 0, mapW, mapH);

  // survey grid
  ctx.strokeStyle = alphaColor(ink, 0.06);
  ctx.lineWidth = 0.5;
  for (let x = 0; x < mapW; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, mapH);
    ctx.stroke();
  }
  for (let y = 0; y < mapH; y += 18) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(mapW, y);
    ctx.stroke();
  }

  // campus outline
  const outline = SITE.campusOutline;
  ctx.beginPath();
  outline.forEach(([x, z], i) => {
    if (i === 0) ctx.moveTo(t.px(x), t.py(z));
    else ctx.lineTo(t.px(x), t.py(z));
  });
  ctx.closePath();
  ctx.fillStyle = alphaColor('#738d65', 0.16);
  ctx.fill();
  ctx.strokeStyle = alphaColor(ink, 0.34);
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // roads
  ctx.strokeStyle = alphaColor(paper, 0.86);
  for (const road of SITE.roads) {
    if (!road.pts || road.pts.length < 2) continue;
    ctx.lineWidth = road.class === 'service' ? 0.8 : 1.4;
    ctx.beginPath();
    road.pts.forEach(([x, z], i) => {
      if (i === 0) ctx.moveTo(t.px(x), t.py(z));
      else ctx.lineTo(t.px(x), t.py(z));
    });
    ctx.stroke();
  }

  // track
  ctx.save();
  ctx.translate(t.px(SITE.track.center[0]), t.py(SITE.track.center[1]));
  ctx.rotate(degToRad(SITE.track.angle));
  ctx.strokeStyle = alphaColor('#9d5a43', 0.82);
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.ellipse(0, 0, (SITE.track.size[1] / 2) * t.s, (SITE.track.size[0] / 2) * t.s, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = alphaColor(ink, 0.18);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.ellipse(0, 0, (SITE.track.size[1] / 2 - 2) * t.s, (SITE.track.size[0] / 2 - 2) * t.s, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // courts
  for (const court of SITE.courts) {
    ctx.save();
    ctx.translate(t.px(court.center[0]), t.py(court.center[1]));
    ctx.rotate(degToRad(court.angle));
    ctx.fillStyle = alphaColor(court.kind === 'volleyball' ? '#769064' : '#64838a', 0.6);
    ctx.fillRect(-court.size[0] * t.s / 2, -court.size[1] * t.s / 2, court.size[0] * t.s, court.size[1] * t.s);
    ctx.restore();
  }

  // buildings
  for (const b of SITE.buildings) {
    const active = b.name && LANDMARKS.find((l) => l.id === state.activeId) &&
      ((b.name === '主教学楼' && state.activeId === 'hall1') ||
       (b.name === '科学馆' && state.activeId === 'science') ||
       (b.name === '凤栖堂' && state.activeId === 'fengqi') ||
       (b.name === '衍林堂' && state.activeId === 'yanlin') ||
       (b.name === '体育馆' && state.activeId === 'gym') ||
       false);
    ctx.beginPath();
    b.poly.forEach(([x, z], i) => {
      if (i === 0) ctx.moveTo(t.px(x), t.py(z));
      else ctx.lineTo(t.px(x), t.py(z));
    });
    ctx.closePath();
    const historic = ['凤栖堂', '衍林堂'].includes(b.name);
    ctx.fillStyle = active ? accent : historic ? alphaColor('#9d5b43', 0.5) : alphaColor(ink, 0.25);
    ctx.strokeStyle = active ? accent : alphaColor(ink, 0.24);
    ctx.lineWidth = active ? 1.2 : 0.5;
    ctx.fill();
    ctx.stroke();
  }

  // gates
  for (const gate of [SITE.northGate, SITE.southGate]) {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(t.px(gate.p[0]), t.py(gate.p[1]), 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // active point
  const active = LANDMARKS.find((spot) => spot.id === state.activeId);
  if (active) {
    const x = t.px(active.map[0]);
    const y = t.py(active.map[1]);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = alphaColor(accent, 0.5);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(x, y, 6.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  // view cone from current target toward the camera
  const tx = clamp(controls.target.x, SITE.bounds.xMin + 5, SITE.bounds.xMax - 5);
  const tz = clamp(controls.target.z, SITE.bounds.zMin + 5, SITE.bounds.zMax - 5);
  const angle = Math.atan2(camera.position.x - tx, camera.position.z - tz);
  const px = t.px(tx);
  const py = t.py(tz);
  ctx.fillStyle = alphaColor(accent, 0.1);
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.arc(px, py, 25, angle - Math.PI / 2 - 0.44, angle - Math.PI / 2 + 0.44);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = alphaColor(accent, 0.75);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + Math.sin(angle) * 15, py + Math.cos(angle) * 15);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(px, py, 2, 0, Math.PI * 2);
  ctx.fill();

  // scale tick
  ctx.strokeStyle = alphaColor(ink, 0.25);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(mapW - 25, mapH - 8);
  ctx.lineTo(mapW - 8, mapH - 8);
  ctx.stroke();
  ctx.fillStyle = alphaColor(muted, 0.65);
  ctx.font = '5px "DM Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText('示意', mapW - 8, mapH - 12);
}

function handleMapClick(event) {
  if (!mapW) return;
  const rect = minimap.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const t = mapTransform();
  let closest = null;
  let distance = 12;
  LANDMARKS.forEach((spot) => {
    const dx = t.px(spot.map[0]) - x;
    const dy = t.py(spot.map[1]) - y;
    const d = Math.hypot(dx, dy);
    if (d < distance) {
      distance = d;
      closest = spot;
    }
  });
  if (closest) {
    stopTour();
    openSpot(closest.id, { source: 'map' });
  }
}

function handleMapHover(event) {
  if (!hasCustomCursor) return;
  const rect = minimap.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const t = mapTransform();
  const near = LANDMARKS.some((spot) => Math.hypot(t.px(spot.map[0]) - x, t.py(spot.map[1]) - y) < 12);
  cursorEl.classList.toggle('is-hover', near);
}

function degToRad(value) {
  return (value * Math.PI) / 180;
}

function roundedRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function alphaColor(hex, alpha) {
  const color = new THREE.Color(hex);
  return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${alpha})`;
}

/* ------------------------------------------------------------------ */
/*  Informational diagrams                                             */
/* ------------------------------------------------------------------ */

function diagramSVG(type) {
  const frame = `
    <g class="dwg-soft">
      <path d="M0 112H360M18 126H342M18 118V134M342 118V134"/>
      <path d="M28 0V98M345 0V98"/>
    </g>
  `;
  const label = (x, y, text, anchor = 'start') =>
    `<text x="${x}" y="${y}" text-anchor="${anchor}">${text}</text>`;

  if (type === 'gate') {
    return `<svg viewBox="0 0 360 132" preserveAspectRatio="xMidYMid meet">
      ${frame}
      <g class="dwg-line">
        <path d="M54 112V64M104 112V72M256 112V72M306 112V64"/>
        <path d="M46 64C74 58 92 41 138 41H222C268 41 286 58 314 64"/>
        <path d="M40 70C70 63 88 47 133 47H227C272 47 290 64 320 70"/>
        <path d="M90 64C110 59 126 47 162 47H198C234 47 250 59 270 64"/>
        <path d="M86 52C106 46 122 34 158 34H202C238 34 254 46 274 52"/>
        <path d="M146 73H214V87H146Z"/>
        <path d="M172 87V112M188 87V112"/>
        <path d="M155 98H205"/>
      </g>
      <g class="dwg-soft">
        <path d="M154 73V87M206 73V87M154 78H206"/>
        <path d="M54 104H104M256 104H306M104 104V112M256 104V112"/>
        <path d="M40 123H320" stroke-dasharray="2 3"/>
      </g>
      <g class="dwg-accent">
        <circle cx="180" cy="57" r="2" fill="currentColor" stroke="none"/>
      </g>
      ${label(20, 126, 'ELEVATION / 牌楼式校门')}
      ${label(340, 126, '四柱三间', 'end')}
    </svg>`;
  }

  if (type === 'main') {
    return `<svg viewBox="0 0 360 132" preserveAspectRatio="xMidYMid meet">
      ${frame}
      <g class="dwg-line">
        <path d="M38 112H322"/>
        <path d="M48 109V66M312 109V66M48 99H312"/>
        <path d="M54 66L78 48H282L306 66"/>
        <path d="M62 64L90 52H270L296 64"/>
        <path d="M48 78H312M48 90H312"/>
        <path d="M132 112V74H228V112"/>
        <path d="M142 74V64M158 74V64M202 74V64M218 74V64"/>
        <path d="M136 68H224"/>
        <path d="M136 112V109M224 112V109"/>
        <path d="M162 112V83H198V112M180 83V112"/>
      </g>
      <g class="dwg-soft">
        <path d="M54 58H306M54 52H306M54 72H306"/>
        <path d="M70 79V89M94 79V89M118 79V89M242 79V89M266 79V89M290 79V89"/>
        <path d="M48 118H312M48 123V126M312 123V126"/>
      </g>
      <g class="dwg-accent">
        <path d="M48 118H312" stroke-dasharray="3 3"/>
        <circle cx="180" cy="43" r="1.7" fill="currentColor" stroke="none"/>
      </g>
      ${label(20, 126, 'CENTRAL AXIS / 中央教学大楼')}
      ${label(340, 126, '坡屋面 · 三面围合', 'end')}
    </svg>`;
  }

  if (type === 'fengqi') {
    return `<svg viewBox="0 0 360 132" preserveAspectRatio="xMidYMid meet">
      ${frame}
      <g class="dwg-line">
        <path d="M60 112V72M108 112V79M144 112V79M180 112V79M216 112V79M252 112V79M300 112V72"/>
        <path d="M46 72C77 67 99 45 142 43H218C261 43 283 65 314 72"/>
        <path d="M40 79C74 72 96 51 139 49H221C264 49 286 70 320 79"/>
        <path d="M96 79C124 71 142 60 176 60H184C218 60 236 71 264 79"/>
        <path d="M96 69H264V60H96Z"/>
        <path d="M84 91H276M84 98H276"/>
        <path d="M118 98V112M144 98V112M180 98V112M216 98V112M242 98V112"/>
        <path d="M167 98V84H193V98"/>
      </g>
      <g class="dwg-soft">
        <path d="M60 115C112 105 248 105 300 115"/>
        <path d="M38 88H322M38 83V93M322 83V93"/>
        <path d="M88 82V92M116 82V92M144 82V92M180 82V92M216 82V92M244 82V92M272 82V92"/>
      </g>
      <g class="dwg-accent">
        <path d="M180 119V122M168 121H192" stroke-width="0.8"/>
        <circle cx="180" cy="67" r="1.8" fill="currentColor" stroke="none"/>
      </g>
      ${label(20, 126, 'ELEVATION / 凤栖堂')}
      ${label(342, 126, '22.1 M / 1934', 'end')}
    </svg>`;
  }

  if (type === 'gongzi') {
    return `<svg viewBox="0 0 360 132" preserveAspectRatio="xMidYMid meet">
      ${frame}
      <g class="dwg-line">
        <path d="M112 26H248V50H286V94H248V118H112V94H74V50H112Z"/>
        <path d="M112 50H144V94H112M216 50H248V94H216"/>
        <path d="M144 66H216M144 82H216"/>
      </g>
      <g class="dwg-soft">
        <path d="M94 38H266M94 106H266"/>
        <path d="M83 50V94M277 50V94"/>
        <path d="M124 58H138M124 72H138M124 86H138M222 58H236M222 72H236M222 86H236"/>
        <path d="M30 72H60M300 72H330"/>
        <path d="M180 18V24M172 21H188"/>
      </g>
      <g class="dwg-accent">
        <path d="M74 112V121M286 112V121M74 118H286" stroke-dasharray="3 3"/>
        <circle cx="180" cy="72" r="2" fill="currentColor" stroke="none"/>
      </g>
      ${label(20, 126, 'PLAN / 工字楼')}
      ${label(342, 126, 'H-BLOCK', 'end')}
      <text x="291" y="31">N</text>
    </svg>`;
  }

  if (type === 'yanlin') {
    return `<svg viewBox="0 0 360 132" preserveAspectRatio="xMidYMid meet">
      ${frame}
      <g class="dwg-line">
        <path d="M54 112V50L78 34H282L310 50V112"/>
        <path d="M54 67H306M54 84H306M54 100H306"/>
        <path d="M54 50H306M66 42H294"/>
        <path d="M88 112V67M112 112V67M136 112V67M160 112V67M200 112V67M224 112V67M248 112V67M272 112V67"/>
        <path d="M144 112V80H216V112"/>
        <path d="M154 80V72H206V80"/>
        <path d="M124 112V102H236V112"/>
      </g>
      <g class="dwg-soft">
        <path d="M68 59H292M68 76H292M68 92H292"/>
        <path d="M124 120H236M124 116V124M236 116V124"/>
        <path d="M180 124V128M170 126H190"/>
      </g>
      <g class="dwg-accent">
        <path d="M152 126H208" stroke-width="0.8"/>
        <circle cx="180" cy="62" r="1.8" fill="currentColor" stroke="none"/>
      </g>
      ${label(20, 126, 'ELEVATION / 衍林堂')}
      ${label(342, 126, 'PUBLIC HALL', 'end')}
    </svg>`;
  }

  if (type === 'gym') {
    return `<svg viewBox="0 0 360 132" preserveAspectRatio="xMidYMid meet">
      ${frame}
      <g class="dwg-line">
        <path d="M42 112V64L70 42H290L318 64V112"/>
        <path d="M42 64H318"/>
        <path d="M70 76C82 62 94 56 106 56V96H70ZM254 56C266 56 278 62 290 76V96H254Z"/>
        <path d="M106 96H254V112H106Z"/>
        <path d="M126 112V85C126 75 134 69 144 69M234 112V85C234 75 226 69 216 69"/>
        <path d="M152 77C152 68 160 62 170 62M208 62C218 62 226 68 226 77"/>
        <path d="M158 112V84H202V112"/>
        <path d="M70 92H106M254 92H290"/>
      </g>
      <g class="dwg-soft">
        <path d="M70 50H290M56 58H304M56 70H304"/>
        <path d="M92 78L70 90M268 78L290 90"/>
        <path d="M304 112V118M56 112V118M56 115H304" stroke-dasharray="2 3"/>
      </g>
      <g class="dwg-accent">
        <circle cx="180" cy="52" r="1.8" fill="currentColor" stroke="none"/>
      </g>
      ${label(20, 126, 'ELEVATION / 胡文虎体育馆')}
      ${label(342, 126, 'ARCHED WINDOWS', 'end')}
    </svg>`;
  }

  if (type === 'tree') {
    return `<svg viewBox="0 0 360 132" preserveAspectRatio="xMidYMid meet">
      ${frame}
      <g class="dwg-line">
        <path d="M178 112C174 95 174 85 166 73C156 59 144 58 132 57M182 112C186 97 194 90 204 78C213 67 225 61 238 59M180 92C166 82 154 78 144 72M180 88C193 78 206 72 220 68"/>
        <path d="M162 91C150 86 141 82 129 81M198 84C210 79 219 75 229 73"/>
      </g>
      <g class="dwg-soft">
        <circle cx="180" cy="54" r="42" />
        <ellipse cx="180" cy="58" rx="73" ry="38" stroke-dasharray="2 4"/>
        <path d="M176 112H184M174 116H186"/>
        <path d="M106 114H254M106 110V118M254 110V118"/>
      </g>
      <g class="dwg-line">
        <path d="M138 64C133 55 136 45 146 39C149 29 161 24 172 29C184 20 200 24 204 36C219 38 228 50 220 60C227 69 218 81 205 80C199 90 186 92 178 84C166 91 149 84 151 73C142 72 134 70 138 64Z"/>
        <circle cx="180" cy="57" r="1.6" fill="currentColor" stroke="none"/>
      </g>
      <g class="dwg-accent">
        <path d="M106 114H254" stroke-dasharray="3 3"/>
      </g>
      ${label(20, 126, 'SITE / 百年榄仁树')}
      ${label(342, 126, 'CENTENNIAL', 'end')}
    </svg>`;
  }

  if (type === 'water') {
    return `<svg viewBox="0 0 360 132" preserveAspectRatio="xMidYMid meet">
      ${frame}
      <g class="dwg-line">
        <path d="M38 62C76 50 92 82 128 70C164 58 174 34 212 44C250 54 254 86 294 72C312 66 322 60 326 56"/>
        <path d="M38 80C78 69 96 99 132 88C168 77 180 52 216 62C252 72 258 103 296 90C312 85 322 78 326 74"/>
        <path d="M154 94C160 86 174 82 184 88M154 94H184"/>
      </g>
      <g class="dwg-soft">
        <path d="M32 112H328M46 114V122M316 114V122"/>
        <path d="M64 60C78 57 88 64 94 72M250 52C264 56 270 66 268 76"/>
        <path d="M114 96C120 104 132 108 144 106M218 92C224 100 236 103 246 100"/>
        <path d="M180 46C174 38 166 34 158 33M182 48C190 40 200 36 210 36"/>
      </g>
      <g class="dwg-accent">
        <path d="M38 70C86 58 98 90 140 78C182 66 186 42 224 52C262 62 264 92 302 80" stroke-dasharray="2 3"/>
        <circle cx="180" cy="63" r="1.6" fill="currentColor" stroke="none"/>
      </g>
      ${label(20, 126, 'COURTYARD WATER / 曲水流觞')}
      ${label(342, 126, 'STONE BRIDGE', 'end')}
    </svg>`;
  }

  if (type === 'sculpture') {
    return `<svg viewBox="0 0 360 132" preserveAspectRatio="xMidYMid meet">
      ${frame}
      <g class="dwg-line">
        <path d="M152 112C138 100 126 84 116 67C108 53 116 42 130 42C140 42 146 50 150 61V112"/>
        <path d="M208 112C222 100 234 84 244 67C252 53 244 42 230 42C220 42 214 50 210 61V112"/>
        <path d="M150 58V83M160 52V81M170 50V80M180 50V80M190 50V80M200 52V81"/>
        <path d="M158 83C170 74 190 74 202 83"/>
        <path d="M174 68V52C174 44 186 44 186 52V68"/>
      </g>
      <g class="dwg-soft">
        <circle cx="180" cy="62" r="13" stroke-dasharray="2 3"/>
        <path d="M142 112H218M152 116V124M208 116V124"/>
        <path d="M120 58C116 50 120 42 128 38M240 58C244 50 240 42 232 38"/>
      </g>
      <g class="dwg-accent">
        <circle cx="180" cy="61" r="2.1" fill="currentColor" stroke="none"/>
      </g>
      ${label(20, 126, 'SCULPTURE / 手形雕塑')}
      ${label(342, 126, 'HANDS · STUDENT', 'end')}
    </svg>`;
  }

  if (type === 'garden') {
    return `<svg viewBox="0 0 360 132" preserveAspectRatio="xMidYMid meet">
      ${frame}
      <g class="dwg-line">
        <path d="M96 108H264V46H96Z"/>
        <path d="M110 94H250V60H110Z"/>
        <path d="M146 80V72H172V80M188 80V72H214V80"/>
        <path d="M146 80H172M188 80H214"/>
      </g>
      <g class="dwg-soft">
        <path d="M104 108V54H256V108" stroke-dasharray="2 3"/>
        <path d="M128 54V46M160 54V46M200 54V46M232 54V46"/>
        <path d="M86 108H274M86 104V112M274 104V112"/>
        <circle cx="180" cy="70" r="4"/>
      </g>
      <g class="dwg-accent">
        <text x="180" y="100" text-anchor="middle" font-size="11">学</text>
        <path d="M180 52V44M174 48H186"/>
      </g>
      ${label(20, 126, 'COURTYARD / 学园')}
      ${label(342, 126, '「学」字铺地', 'end')}
    </svg>`;
  }

  if (type === 'stone') {
    return `<svg viewBox="0 0 360 132" preserveAspectRatio="xMidYMid meet">
      ${frame}
      <g class="dwg-line">
        <path d="M76 112C66 99 71 82 89 73C96 57 117 50 135 59C149 43 176 45 185 64C204 58 220 71 217 89C233 100 225 112 208 112Z"/>
        <path d="M97 90C111 84 120 88 126 99M147 77C158 69 173 72 180 84M183 98C193 91 204 94 208 103"/>
        <path d="M106 112V102H170V112"/>
      </g>
      <g class="dwg-soft">
        <path d="M60 118H246M60 114V122M246 114V122"/>
        <path d="M90 106H214M96 61C88 52 84 43 88 35M207 70C218 63 226 53 225 43"/>
      </g>
      <g class="dwg-accent">
        <path d="M116 78C124 74 132 76 136 82M155 96C162 92 169 93 173 99" stroke-width="0.8"/>
        <text x="180" y="44" text-anchor="middle" font-size="7">虎踞龙盘</text>
      </g>
      ${label(20, 126, 'STONE / 虎踞龙盘太湖石')}
      ${label(342, 126, '93 T · 2012', 'end')}
    </svg>`;
  }

  if (type === 'statue') {
    return `<svg viewBox="0 0 360 132" preserveAspectRatio="xMidYMid meet">
      ${frame}
      <g class="dwg-line">
        <path d="M124 112H236V104H124Z"/>
        <path d="M160 104V83C148 77 145 64 151 54C157 44 170 40 180 43C192 45 200 54 200 65C200 76 192 82 181 85V104"/>
        <path d="M154 104V90M176 104V90M206 104V90M124 104V92M236 104V92"/>
        <circle cx="181" cy="35" r="10"/>
        <path d="M171 44C175 49 187 49 191 44M176 32C178 27 184 27 186 32"/>
      </g>
      <g class="dwg-soft">
        <path d="M96 112H264M96 108V116M264 108V116"/>
        <path d="M122 54C130 46 139 43 148 43M218 54C210 46 201 43 192 43" stroke-dasharray="2 3"/>
      </g>
      <g class="dwg-accent">
        <circle cx="181" cy="62" r="1.8" fill="currentColor" stroke="none"/>
        <path d="M154 118H208" stroke-dasharray="2 3"/>
      </g>
      ${label(20, 126, 'STATUE / 校园雕像')}
      ${label(342, 126, 'BRONZE · STONE', 'end')}
    </svg>`;
  }

  // field
  return `<svg viewBox="0 0 360 132" preserveAspectRatio="xMidYMid meet">
    ${frame}
    <g class="dwg-line">
      <ellipse cx="180" cy="70" rx="112" ry="45"/>
      <ellipse cx="180" cy="70" rx="93" ry="33"/>
      <path d="M80 70H280M180 37V103"/>
      <circle cx="180" cy="70" r="17"/>
      <path d="M112 53V87H80V53M248 53V87H280V53"/>
      <path d="M292 70C292 90 242 104 180 104C118 104 68 90 68 70C68 50 118 36 180 36C242 36 292 50 292 70Z" stroke-dasharray="2 4"/>
    </g>
    <g class="dwg-soft">
      <path d="M68 118H292M68 114V122M292 114V122"/>
      <path d="M70 78H292M70 70H292M70 62H292"/>
      <path d="M180 116V122M170 119H190"/>
    </g>
    <g class="dwg-accent">
      <path d="M292 54V86" stroke-width="1.4"/>
      <circle cx="180" cy="70" r="1.4" fill="currentColor" stroke="none"/>
    </g>
    ${label(20, 126, 'SITE PLAN / 大运动场')}
    ${label(342, 126, 'TRACK · PITCH', 'end')}
  </svg>`;
}

/* ------------------------------------------------------------------ */
/*  About, toast, helpers                                              */
/* ------------------------------------------------------------------ */

function openAbout() {
  state.modalOpen = true;
  stopTour();
  setModalCursor(true);
  if (!aboutDialog.open) aboutDialog.showModal();
}

function closeAbout() {
  if (!aboutDialog.open) return;
  state.modalOpen = false;
  setModalCursor(false);
  aboutDialog.close();
}

function setModalCursor(open) {
  document.documentElement.classList.toggle('show-native-cursor', open);
  if (open) {
    cursorEl.classList.remove('is-visible');
  }
}

function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add('is-visible');
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => {
    toastEl.classList.remove('is-visible');
  }, 2400);
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function setLoadingState(percent, label) {
  if (loadingBar) loadingBar.style.width = `${percent}%`;
  if (loadingPct) loadingPct.textContent = String(Math.round(percent)).padStart(3, '0');
  if (label && loadingStage) loadingStage.textContent = label;
}

/* ------------------------------------------------------------------ */
/*  Resize & render loop                                               */
/* ------------------------------------------------------------------ */

function resize() {
  if (!renderer || !camera) return;
  measureViewport();
  const width = viewW;
  const height = viewH;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(width, height, false);
  if (renderer) renderer.shadowMap.needsUpdate = true;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  resizeMap();
}

function renderFrame(now) {
  if (!campus || !renderer) return;
  const delta = Math.min(clock ? clock.getDelta() : 0.016, 0.055);
  campus.tick(delta);
  weather?.tick?.(delta);
  campus.updateBuildingLabels(camera);
  // 影片期间相机由 js/film.js 驱动：跳过补间、OrbitControls 回写与边界钳制。
  if (!film?.isPlaying?.()) {
    updateCameraTween(now);
    controls.update();

    controls.target.x = clamp(controls.target.x, SITE.bounds.xMin + 5, SITE.bounds.xMax - 5);
    controls.target.y = clamp(controls.target.y, 0, 22);
    controls.target.z = clamp(controls.target.z, SITE.bounds.zMin + 5, SITE.bounds.zMax - 5);
  }

  updateMarkers();

  if (renderer) renderer.render(scene, camera);

  state.mapTick += 1;
  if (state.mapTick % 4 === 0 && mapW > 0) drawMap();
  cursorPos.x += (cursorTarget.x - cursorPos.x) * 0.24;
  cursorPos.y += (cursorTarget.y - cursorPos.y) * 0.24;
}
