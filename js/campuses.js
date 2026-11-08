/**
 * 多校区注册表与 URL 契约（Multi-campus registry）
 * ============================================================================
 * 数据分层：
 *   js/data.js              府城校区「内容层」：CAMPUS_META / LANDMARKS / TOUR_ORDER / SOURCES / FUCHENG_CAMPUS
 *   js/site.js              府城校区「空间层」：SITE（OSM 整理；1 场景单位 ≈ 2 米，x = 东，z = 南，北 = -z）
 *   js/campuses.js          本文件：「注册表层」：把内容层 + 空间层 + 场景声明组装成 campus 条目，
 *                           并负责 ?campus=<id> 解析、默认回退、能力位与校验。
 *   js/campus-accurate.js   当前唯一的「场景构建器」：仍硬编码府城校区的道路/植被/学生/重点建筑，
 *                           解耦与新增校区的完整步骤见 docs/campuses.md。
 *
 * 兜底规则（resolveCampus / getCampus）：
 *   - 参数缺省或为空      → 默认校区 DEFAULT_CAMPUS_ID（府城），reason = 'empty'
 *   - 未注册的 id         → 默认校区，reason = 'unknown'（建议 toast 提示并清理 URL）
 *   - 已注册但未上线       → 默认校区，reason = 'planned'（status !== 'active'）
 *   - id 一律 trim + 小写后精确匹配，不做模糊匹配，避免校区歧义。
 *   - getCampus(id) 是注册表查询：已注册（含 planned）返回条目本身；未注册才回退默认校区。
 *
 * URL 契约（?campus=<id>）：
 *   ?campus=fucheng         → 府城校区（默认校区，规范 URL 中可省略该参数）
 *   无 campus 参数 / 空值    → 默认校区
 *   ?campus=xxx（未注册）    → 回退默认校区，toast「未知校区「xxx」，已回到府城校区」，
 *                             建议 history.replaceState 清理非法参数
 *   ?campus=meilun（未上线） → 回退默认校区，toast「美伦校区尚未上线」；同样建议清理参数，
 *                             上线后同一链接会自动生效
 *   切换校区                → 非默认校区：replaceState 写入 ?campus=<id>；
 *                             切回默认校区：删除该参数（保持规范 URL）
 *   ?spot= / ?view= / ?hour= → 一律按「解析后的 active 校区」校验：例如 ?campus=xxx&spot=gate
 *                             中 spot=gate 只在目标校区存在该地标时生效，否则忽略。
 *
 * main.js 集成伪代码（本文件不改 main.js，交给集成者；详见 docs/campuses.md）：
 *
 *   import { CAMPUSES, parseCampusParam, buildCampusSearch, resolveCampus }
 *     from './campuses.js';
 *   import { buildCampus as buildFuchengScene } from './campus-accurate.js';
 *
 *   const SCENE_BUILDERS = { fucheng: buildFuchengScene };        // 未来每校区一个构建器
 *
 *   const route = parseCampusParam(window.location.search);
 *   // { param, requestedId, campus, fallback, reason: 'ok'|'empty'|'unknown'|'planned' }
 *   const ACTIVE_CAMPUS = route.campus;                           // 永远是 active 校区
 *   const { site: SITE, landmarks: LANDMARKS, tourOrder: TOUR_ORDER, sources: SOURCES }
 *     = ACTIVE_CAMPUS;
 *   if (route.fallback && route.param) {
 *     showToast(route.reason === 'planned'
 *       ? `${CAMPUSES[route.requestedId]?.name ?? route.param}尚未上线`
 *       : `未知校区「${route.param}」，已回到${CAMPUSES[route.requestedId]?.name ?? '默认校区'}`);
 *     history.replaceState(null, '',
 *       location.pathname + buildCampusSearch(ACTIVE_CAMPUS.id, location.search) + location.hash);
 *   }
 *   campus = SCENE_BUILDERS[ACTIVE_CAMPUS.scene.builder](scene, renderer, {
 *     campus: ACTIVE_CAMPUS, site: SITE, reducedMotion
 *   });
 *
 *   切换校区 = 卸载旧场景（dispose）→ 用新 campus 重建 UI（LANDMARKS / SOURCES / 品牌文案）
 *   → 构建新场景 → 更新历史记录。切换后不应残留上一个校区的 THREE 资源。
 *
 * 字段与新增校区的可执行步骤见 docs/campuses.md。
 */

import { SITE } from './site.js';
import { FUCHENG_CAMPUS } from './data.js';

/* ========================================================================== */
/*  常量                                                                       */
/* ========================================================================== */

/** 默认校区（无参数 / 未知参数 / 未上线校区时的兜底）。 */
export const DEFAULT_CAMPUS_ID = 'fucheng';

/** ?campus=<id> 的合法 id：小写字母 / 数字开头，可含连字符。 */
const CAMPUS_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** active 校区缺省能力位（可被条目里的 features 覆盖）。 */
const ACTIVE_FEATURES = Object.freeze({
  walk: true,
  weather: true,
  tour: true,
  minimap: true,
  labels: true
});

/** planned 校区缺省能力位：未上线 = 不声明任何可渲染能力。 */
const PLANNED_FEATURES = Object.freeze({
  walk: false,
  weather: false,
  tour: false,
  minimap: false,
  labels: false
});

/** 场景构建器必须实现的 API（validateSceneApi 使用；契约见 docs/campuses.md）。 */
export const SCENE_API_METHODS = Object.freeze([
  'setTime',
  'getTime',
  'getNight',
  'tick',
  'updateBuildingLabels',
  'setSelection',
  'hideSelection'
]);

/* ========================================================================== */
/*  基础类型判断（无依赖，可在 Node / 浏览器直接运行）                          */
/* ========================================================================== */

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const isVec = (value, size) =>
  Array.isArray(value) && value.length === size && value.every(isFiniteNumber);

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

/**
 * 归一化校区 id：trim + 小写。
 * @param {unknown} id
 * @returns {string} 归一化后的 id；非字符串返回空字符串
 */
export function normalizeCampusId(id) {
  return typeof id === 'string' ? id.trim().toLowerCase() : '';
}

/* ========================================================================== */
/*  校区工厂                                                                   */
/* ========================================================================== */

/**
 * 把「内容层 + 空间层 + 场景声明」合并为一个完整的 campus 条目。
 * 只补默认值，不校验（如需校验传 { validate: true }）；返回的条目被冻结。
 *
 * @param {object} config 校区配置，至少提供 id / name / school；
 *                        active 校区还需 site / landmarks / overview / top 等（见 docs/campuses.md）
 * @param {{ validate?: boolean }} [options] validate=true 时校验失败抛错（新增校区时建议开启）
 * @returns {Readonly<object>} frozen campus entry
 * @throws {TypeError} config 不是对象
 * @throws {Error} options.validate 为 true 且 validateCampus() 不通过
 */
export function defineCampus(config = {}, options = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('[campuses] defineCampus(config)：config 必须是对象');
  }
  // 非法 status 原样保留，交给 validateCampus 报错（避免静默把脏数据改成 active）。
  const status = config.status ?? 'active';
  const featureDefaults = status === 'planned' ? PLANNED_FEATURES : ACTIVE_FEATURES;
  const campus = {
    id: config.id,
    status,
    order: isFiniteNumber(config.order) ? config.order : 0,
    school: config.school ?? '',
    schoolEn: config.schoolEn ?? '',
    name: config.name ?? '',
    /** 学段（如「高中部」）；仅作展示元数据，不参与校验与渲染决策。 */
    division: config.division ?? '',
    shortName: config.shortName ?? config.name ?? '',
    en: config.en ?? '',
    shortEn: config.shortEn ?? '',
    address: config.address ?? null,
    founded: config.founded ?? null,
    location: config.location ?? null,
    summary: config.summary ?? '',
    overview: config.overview ?? null,
    top: config.top ?? null,
    mobile: config.mobile ?? null,
    site: config.site ?? null,
    landmarks: config.landmarks ?? [],
    tourOrder: config.tourOrder ?? [],
    sources: config.sources ?? [],
    theme: config.theme ?? {},
    features: { ...featureDefaults, ...(config.features || {}) },
    license: config.license ?? null,
    scene: config.scene ?? null,
    note: config.note ?? ''
  };
  campus.fullName =
    config.fullName ?? [campus.school, campus.name].filter(isNonEmptyString).join(' · ');
  campus.fullEn =
    config.fullEn ?? [campus.schoolEn, campus.en].filter(isNonEmptyString).join(' · ');

  if (options.validate) {
    const result = validateCampus(campus);
    if (!result.ok) {
      const error = new Error(
        `[campuses] 校区「${campus.id ?? '?'}」校验失败：\n· ${result.errors.join('\n· ')}`
      );
      error.campusId = campus.id ?? null;
      error.validationErrors = result.errors;
      throw error;
    }
  }
  return Object.freeze(campus);
}

/** createCampus 是 defineCampus 的别名（供外部脚本/工具使用）。 */
export const createCampus = defineCampus;

/* ========================================================================== */
/*  注册表                                                                     */
/* ========================================================================== */

/** 府城校区：内容层来自 js/data.js，空间层来自 js/site.js。 */
const fuchengCampus = defineCampus(
  {
    ...FUCHENG_CAMPUS,
    site: SITE,
    scene: {
      builder: 'fucheng',
      // 信息性元数据：说明该校区数据/构建器所在文件，供文档与工具使用，不参与运行时加载。
      files: {
        site: 'js/site.js',
        narrative: 'js/data.js',
        scene: 'js/campus-accurate.js'
      }
    }
  },
  { validate: true }
);

/**
 * 美伦校区（planned）：仅元数据占位，明确「未上线」。
 * 刻意不提供 site / landmarks / overview / sources / theme 等空间与叙事数据——
 * 本图志尚未采集该校区平面、地标与模型，禁止凭猜测填写。
 * 上线流程：补齐数据 → status 改为 'active' → defineCampus(..., { validate: true }) 通过。
 */
const meilunCampus = defineCampus(
  {
    id: 'meilun',
    status: 'planned',
    order: 2,
    school: '海南中学',
    schoolEn: 'HAINAN MIDDLE SCHOOL',
    name: '美伦校区',
    shortName: '美伦',
    // 英文名为音译占位，待校方公开资料核实。
    en: 'MEILUN CAMPUS',
    shortEn: 'MEILUN',
    summary: '海南中学已公开招生的另一校区；本图志尚未采集其平面、叙事与模型数据。',
    note:
      '未上线（planned）：仅有元数据占位。缺少 OSM/实测平面、地标叙事、重点建筑模型与取景相机；' +
      '禁止凭猜测填充 site / landmarks。上线前请把 status 改为 active，补齐数据并让 defineCampus({ validate: true }) 通过。'
  },
  { validate: true }
);

/** 全部已注册校区（id → campus）。planned 校区也在注册表内，由 UI 自行过滤。 */
export const CAMPUSES = Object.freeze(
  Object.fromEntries(
    [fuchengCampus, meilunCampus].map((campus) => [campus.id, campus])
  )
);

/** 按 order 排序的全部校区（active 在前，planned 在后；order 相同按 id）。 */
const sortedCampuses = Object.values(CAMPUSES).sort(
  (a, b) =>
    Number(b.status === 'active') - Number(a.status === 'active') ||
    a.order - b.order ||
    a.id.localeCompare(b.id)
);

/** 按上述顺序冻结的全部校区列表（校区切换器 / 选择页用）。 */
export const CAMPUS_LIST = Object.freeze(sortedCampuses);

/** 仅可渲染的 active 校区列表（切换器只展示这些；planned 仅做“未上线”提示）。 */
export const ACTIVE_CAMPUSES = Object.freeze(
  sortedCampuses.filter((campus) => campus.status === 'active')
);

/* ========================================================================== */
/*  查询与 URL 路由                                                            */
/* ========================================================================== */

/**
 * 注册表查询（不负责“可渲染”判断）：
 * 已注册校区（含 planned）返回条目本身；未注册 / 空值回退默认校区。
 * @param {unknown} id
 * @returns {Readonly<object>} campus entry
 */
export function getCampus(id) {
  const key = normalizeCampusId(id);
  if (key && hasOwn(CAMPUSES, key)) return CAMPUSES[key];
  return CAMPUSES[DEFAULT_CAMPUS_ID];
}

/**
 * 路由解析：把请求的校区 id 解析为“实际可渲染”的校区。
 * unknown / planned / 空值都会回退 DEFAULT_CAMPUS_ID，并给出 reason 供 UI 提示。
 *
 * @param {unknown} id 请求的校区 id（可来自 ?campus=）
 * @param {{ allowPlanned?: boolean }} [options] allowPlanned=true 时 planned 校区也按原样返回（测试/后台预览）
 * @returns {{ requestedId: string|null, campus: Readonly<object>, fallback: boolean,
 *            reason: 'ok'|'empty'|'unknown'|'planned' }}
 */
export function resolveCampus(id, options = {}) {
  const requestedId = normalizeCampusId(id);
  const fallbackCampus = CAMPUSES[DEFAULT_CAMPUS_ID];
  let campus = null;
  let reason = 'ok';
  if (!requestedId) {
    reason = 'empty';
  } else if (!hasOwn(CAMPUSES, requestedId)) {
    reason = 'unknown';
  } else if (!options.allowPlanned && CAMPUSES[requestedId].status !== 'active') {
    reason = 'planned';
  } else {
    campus = CAMPUSES[requestedId];
  }
  return Object.freeze({
    requestedId: requestedId || null,
    campus: campus || fallbackCampus,
    fallback: !campus,
    reason
  });
}

/**
 * 解析 ?campus=<id> 查询参数（只读取 campus，其他参数原样保留在 search 中）。
 * main.js 应在 boot 最早期调用一次，后续所有 UI / 场景都以返回的 campus 为准。
 *
 * @param {string|URLSearchParams} [search] window.location.search 或 URLSearchParams
 * @returns {{ param: string|null, requestedId: string|null, campus: Readonly<object>,
 *            fallback: boolean, reason: 'ok'|'empty'|'unknown'|'planned' }}
 */
export function parseCampusParam(search = '') {
  const params = new URLSearchParams(search);
  const param = params.get('campus');
  return Object.freeze({ param, ...resolveCampus(param) });
}

/**
 * 生成规范化后的查询串（供切换校区时 history.replaceState 使用）：
 * - 默认校区：删除 campus 参数（规范 URL 不带默认值）
 * - 非默认 active 校区：写入 campus=<id>
 * - 未知 / planned / 非法 id：删除 campus 参数（回到规范 URL）
 * 其余查询参数（spot / hour / view / nointro…）原样保留。
 *
 * @param {string} id 目标校区 id
 * @param {string|URLSearchParams} [search] 当前 location.search
 * @returns {string} '' 或 '?a=b&c=d'
 */
export function buildCampusSearch(id, search = '') {
  const params = new URLSearchParams(search);
  const key = normalizeCampusId(id);
  const campus = key && hasOwn(CAMPUSES, key) ? CAMPUSES[key] : null;
  if (campus && campus.status === 'active' && key !== DEFAULT_CAMPUS_ID) {
    params.set('campus', key);
  } else {
    params.delete('campus');
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * 从「构建器映射表」中解析某个校区的场景构建器。
 * main.js 只维护一张 { builderId: buildScene } 表；本函数负责把 campus.scene.builder
 * 映射到具体函数，找不到时给出明确错误（而不是黑屏）。
 *
 * @param {string|object} campusOrId 校区 id 或 campus 条目
 * @param {Record<string, Function>} builders 构建器映射表
 * @returns {{ campus: Readonly<object>, builder: Function }}
 * @throws {Error} 校区无效或缺少构建器
 */
export function resolveSceneBuilder(campusOrId, builders = {}) {
  const campus =
    typeof campusOrId === 'object' && campusOrId !== null
      ? campusOrId
      : resolveCampus(campusOrId).campus;
  if (!campus || typeof campus !== 'object') {
    throw new Error('[campuses] resolveSceneBuilder：无效的校区');
  }
  const key = campus.scene?.builder ?? campus.id;
  const builder = hasOwn(builders, key) ? builders[key] : null;
  if (typeof builder !== 'function') {
    throw new Error(
      `[campuses] 未找到校区「${campus.id}」的场景构建器（scene.builder = "${key}"）；` +
        '请先在 SCENE_BUILDERS 中注册构建函数（见 docs/campuses.md）。'
    );
  }
  return { campus, builder };
}

/* ========================================================================== */
/*  校验（纯函数，不抛错；新增校区/CI/浏览器控制台均可调用）                    */
/* ========================================================================== */

function checkVec(value, size, path, errors) {
  if (!isVec(value, size)) {
    errors.push(`${path} 必须是 ${size} 个有限数字（${size === 3 ? 'x, y, z' : 'x, z'}）`);
    return false;
  }
  return true;
}

function checkCamera(camera, path, errors) {
  if (!camera || typeof camera !== 'object') {
    errors.push(`${path} 缺失，必须是 { position, target, fov }`);
    return;
  }
  checkVec(camera.position, 3, `${path}.position`, errors);
  checkVec(camera.target, 3, `${path}.target`, errors);
  if (!isFiniteNumber(camera.fov) || camera.fov < 10 || camera.fov > 120) {
    errors.push(`${path}.fov 必须是 10–120 之间的有限数字`);
  }
}

function checkMobile(mobile, errors) {
  if (mobile == null) return;
  if (typeof mobile !== 'object' || Array.isArray(mobile)) {
    errors.push('mobile 必须是对象 { overview?, top?, frameWidth? }');
    return;
  }
  if (mobile.overview != null) checkCamera(mobile.overview, 'mobile.overview', errors);
  if (mobile.top != null) checkCamera(mobile.top, 'mobile.top', errors);
  if (mobile.frameWidth != null) {
    if (typeof mobile.frameWidth !== 'object' || Array.isArray(mobile.frameWidth)) {
      errors.push('mobile.frameWidth 必须是 { <landmarkId>: number }');
    } else {
      for (const [key, value] of Object.entries(mobile.frameWidth)) {
        if (!isFiniteNumber(value) || value <= 0) {
          errors.push(`mobile.frameWidth.${key} 必须是正数（场景单位宽度）`);
        }
      }
    }
  }
}

function checkSite(site, errors, warnings) {
  if (!site || typeof site !== 'object') {
    errors.push('active 校区必须提供 site（js/site.js 导出的空间数据）');
    return;
  }
  const bounds = site.bounds;
  if (!bounds || typeof bounds !== 'object') {
    errors.push('site.bounds 缺失');
  } else if (!['xMin', 'xMax', 'zMin', 'zMax'].every((key) => isFiniteNumber(bounds[key]))) {
    errors.push('site.bounds 必须包含有限数字 xMin / xMax / zMin / zMax');
  } else if (!(bounds.xMin < bounds.xMax && bounds.zMin < bounds.zMax)) {
    errors.push('site.bounds 需满足 xMin < xMax 且 zMin < zMax');
  }
  if (!Array.isArray(site.campusOutline) || site.campusOutline.length < 3) {
    errors.push('site.campusOutline 必须至少 3 个 [x, z] 点');
  } else {
    site.campusOutline.forEach((point, i) =>
      checkVec(point, 2, `site.campusOutline[${i}]`, errors)
    );
  }
  if (!Array.isArray(site.buildings)) {
    errors.push('site.buildings 必须是数组（可为空数组）');
  } else {
    site.buildings.forEach((building, i) => {
      const path = `site.buildings[${i}]`;
      if (!building || typeof building !== 'object') {
        errors.push(`${path} 必须是对象`);
        return;
      }
      if (!isNonEmptyString(building.id)) {
        warnings.push(`${path}.id 建议保留 OSM way id，便于追溯与 ODbL 署名`);
      }
      if (!Array.isArray(building.poly) || building.poly.length < 3) {
        errors.push(`${path}.poly 必须至少 3 个 [x, z] 点`);
      }
      checkVec(building.center, 2, `${path}.center`, errors);
    });
  }
  if (!site.track || typeof site.track !== 'object') {
    errors.push('site.track 缺失（小地图与运动场需要 { center, size, angle }）');
  } else {
    checkVec(site.track.center, 2, 'site.track.center', errors);
    checkVec(site.track.size, 2, 'site.track.size', errors);
    if (!isFiniteNumber(site.track.angle)) {
      errors.push('site.track.angle 必须是有限数字（角度）');
    }
  }
  for (const key of ['courts', 'roads', 'gates']) {
    if (!Array.isArray(site[key])) errors.push(`site.${key} 必须是数组（可为空数组）`);
  }
  for (const key of ['northGate', 'southGate']) {
    const gate = site[key];
    if (!gate || typeof gate !== 'object') {
      errors.push(`site.${key} 缺失（{ p: [x, z], angle }）`);
    } else {
      checkVec(gate.p, 2, `site.${key}.p`, errors);
      if (!isFiniteNumber(gate.angle)) warnings.push(`site.${key}.angle 建议为数字（角度）`);
    }
  }
  if (!isNonEmptyString(site.attribution)) {
    warnings.push('site.attribution 建议填写 OpenStreetMap / ODbL 署名');
  }
  if (isFiniteNumber(site.scale) && site.scale !== 0.5) {
    warnings.push('site.scale 建议保持 0.5（1 场景单位 ≈ 2 米）');
  }
}

function checkLandmark(landmark, i, errors, warnings) {
  const path = `landmarks[${i}]`;
  if (!landmark || typeof landmark !== 'object') {
    errors.push(`${path} 必须是对象`);
    return;
  }
  if (!isNonEmptyString(landmark.id)) {
    errors.push(`${path}.id 必填（地标唯一键，用于 ?spot=<id>）`);
  } else if (!/^[a-z0-9][a-z0-9_-]*$/i.test(landmark.id)) {
    warnings.push(`${path}.id 建议使用小写字母 / 数字 / 连字符`);
  }
  if (!isNonEmptyString(landmark.name)) errors.push(`${path}.name 必填`);
  if (!isNonEmptyString(landmark.en)) warnings.push(`${path}.en 建议填写（中英对照排版）`);
  if (!isNonEmptyString(landmark.index)) {
    errors.push(`${path}.index 必填且为字符串（如 "01"，用于索引与标记编号）`);
  }
  checkVec(landmark.anchor, 3, `${path}.anchor`, errors);
  checkCamera(landmark.camera, `${path}.camera`, errors);
  checkVec(landmark.map, 2, `${path}.map`, errors);
  if (!isNonEmptyString(landmark.diagram)) {
    errors.push(`${path}.diagram 必填（对应 main.js diagramSVG 的类型键，如 "gate"）`);
  }
  if (!isNonEmptyString(landmark.summary)) warnings.push(`${path}.summary 建议填写`);
  if (!isNonEmptyString(landmark.description)) errors.push(`${path}.description 必填`);
  if (!Array.isArray(landmark.facts)) {
    errors.push(`${path}.facts 必须是数组（元素为 [label, value]）`);
  } else {
    landmark.facts.forEach((fact, j) => {
      if (!Array.isArray(fact) || fact.length < 2) {
        errors.push(`${path}.facts[${j}] 必须是 [label, value]`);
      }
    });
  }
}

function checkTheme(theme, errors, warnings) {
  if (theme == null || typeof theme !== 'object' || Array.isArray(theme)) {
    warnings.push('theme 建议提供页面/小地图主题色');
    return;
  }
  for (const key of ['paper', 'ink', 'muted', 'accent']) {
    if (!isNonEmptyString(theme[key])) warnings.push(`theme.${key} 建议填写（CSS 变量同名色）`);
  }
  if (theme.map && (typeof theme.map !== 'object' || Array.isArray(theme.map))) {
    errors.push('theme.map 必须是对象（小地图专用色）');
  }
}

function checkFeatures(features, errors) {
  if (features == null || typeof features !== 'object' || Array.isArray(features)) {
    errors.push('features 必须是对象（能力位：walk / weather / tour / minimap / labels）');
    return;
  }
  for (const [key, value] of Object.entries(features)) {
    if (typeof value !== 'boolean') errors.push(`features.${key} 必须是布尔值`);
  }
}

/**
 * 校验单个 campus 条目（纯函数，不抛错）。
 * active 校区做完整校验（site / landmarks / tourOrder / 相机 / 主题 / 能力位）；
 * planned 校区只校验元数据，并禁止声明 site / landmarks（防止伪造未上线校区的数据）。
 *
 * @param {object} campus
 * @returns {{ ok: boolean, campusId: string|null, status: string|null, errors: string[], warnings: string[] }}
 */
export function validateCampus(campus) {
  const errors = [];
  const warnings = [];
  if (!campus || typeof campus !== 'object' || Array.isArray(campus)) {
    return { ok: false, campusId: null, status: null, errors: ['campus 必须是对象'], warnings };
  }
  const id = typeof campus.id === 'string' ? campus.id : null;
  if (!isNonEmptyString(campus.id)) {
    errors.push('id 必填');
  } else if (!CAMPUS_ID_PATTERN.test(campus.id)) {
    errors.push('id 必须匹配 /^[a-z0-9][a-z0-9-]*$/（用作 ?campus=<id>）');
  }
  if (campus.status !== 'active' && campus.status !== 'planned') {
    errors.push("status 必须是 'active' 或 'planned'");
  }
  if (!isNonEmptyString(campus.school)) {
    errors.push('school 必填（学校名，如「海南中学」）');
  }
  if (!isNonEmptyString(campus.name)) {
    errors.push('name 必填（校区名，如「府城校区」）');
  }
  if (!isFiniteNumber(campus.order)) {
    warnings.push('order 建议为数字（校区切换器排序）');
  }
  if (!isNonEmptyString(campus.en)) warnings.push('en 建议填写（校区英文名）');
  if (!isNonEmptyString(campus.shortName)) warnings.push('shortName 建议填写（大字标题短名）');

  if (campus.status === 'active') {
    if (!isNonEmptyString(campus.en)) errors.push('active 校区 en 必填');
    if (!isNonEmptyString(campus.address)) errors.push('active 校区 address 必填');
    if (!isNonEmptyString(campus.founded)) warnings.push('active 校区 founded 建议填写');
    if (!isNonEmptyString(campus.summary)) warnings.push('summary 建议填写（一句话校区简介）');
    checkCamera(campus.overview, 'overview', errors);
    checkCamera(campus.top, 'top', errors);
    checkMobile(campus.mobile, errors);
    checkSite(campus.site, errors, warnings);
    checkTheme(campus.theme, errors, warnings);
    checkFeatures(campus.features, errors);

    if (!Array.isArray(campus.landmarks) || campus.landmarks.length === 0) {
      errors.push('active 校区 landmarks 必须是非空数组');
    } else {
      const landmarkIds = new Set();
      campus.landmarks.forEach((landmark, i) => {
        checkLandmark(landmark, i, errors, warnings);
        const landmarkId = landmark?.id;
        if (isNonEmptyString(landmarkId)) {
          if (landmarkIds.has(landmarkId)) {
            errors.push(`landmarks[${i}].id 重复：${landmarkId}`);
          }
          landmarkIds.add(landmarkId);
        }
      });
      if (campus.site?.bounds) {
        const { xMin, xMax, zMin, zMax } = campus.site.bounds;
        if ([xMin, xMax, zMin, zMax].every(isFiniteNumber)) {
          campus.landmarks.forEach((landmark, i) => {
            const point = landmark?.map;
            if (!isVec(point, 2)) return;
            if (point[0] < xMin - 20 || point[0] > xMax + 20 || point[1] < zMin - 20 || point[1] > zMax + 20) {
              warnings.push(
                `landmarks[${i}].map 超出 site.bounds（请检查坐标系 / 比例是否按 1 场景单位 ≈ 2 米）`
              );
            }
          });
        }
      }
      if (!Array.isArray(campus.tourOrder)) {
        errors.push('tourOrder 必须是 landmark id 数组');
      } else {
        const seen = new Set();
        campus.tourOrder.forEach((tourId, i) => {
          if (!landmarkIds.has(tourId)) {
            errors.push(`tourOrder[${i}]「${tourId}」不是已登记的 landmark id`);
          }
          if (seen.has(tourId)) errors.push(`tourOrder[${i}] 重复：${tourId}`);
          seen.add(tourId);
        });
        if (campus.features?.tour === true && campus.tourOrder.length === 0) {
          warnings.push('features.tour = true 但 tourOrder 为空（自动导览将没有内容）');
        }
      }
    }
    if (!Array.isArray(campus.sources) || campus.sources.length === 0) {
      warnings.push('sources 建议至少一条（含 ODbL 署名与官方资料链接）');
    }
    if (!campus.license || !isNonEmptyString(campus.license.attribution)) {
      warnings.push('license.attribution 建议填写（OSM / ODbL 署名义务）');
    }
    if (!campus.scene || !isNonEmptyString(campus.scene.builder)) {
      warnings.push('scene.builder 建议声明（main.js 据此选择场景构建器）');
    }
  } else if (campus.status === 'planned') {
    if (campus.site != null) {
      errors.push('planned 校区不得提供 site（未上线校区不允许伪造空间数据）');
    }
    if (Array.isArray(campus.landmarks) && campus.landmarks.length > 0) {
      errors.push('planned 校区不得提供 landmarks（未上线校区不允许伪造叙事数据）');
    }
    if (campus.features && Object.values(campus.features).some((value) => value === true)) {
      warnings.push('planned 校区 features 应全部为 false（未上线不等于可用）');
    }
    if (!isNonEmptyString(campus.note)) {
      warnings.push('planned 校区建议填写 note，说明「未上线」状态与缺失的数据');
    }
  }

  return {
    ok: errors.length === 0,
    campusId: id,
    status: typeof campus.status === 'string' ? campus.status : null,
    errors,
    warnings
  };
}

/**
 * 校验整个注册表：每个条目 + 键名一致性 + 默认校区可用性。
 * 建议在 CI / 临时脚本中调用（模块载入时也会静默跑一次，失败时 console.error）。
 *
 * @returns {{ ok: boolean, errors: string[],
 *            results: Array<{ ok: boolean, campusId: string|null, status: string|null,
 *                             errors: string[], warnings: string[] }> }}
 */
export function validateRegistry() {
  const errors = [];
  const results = Object.values(CAMPUSES).map((campus) => validateCampus(campus));
  for (const [key, campus] of Object.entries(CAMPUSES)) {
    if (key !== campus.id) {
      errors.push(`CAMPUSES 键「${key}」与 campus.id「${campus.id}」不一致`);
    }
  }
  const ids = new Set();
  for (const campus of Object.values(CAMPUSES)) {
    if (ids.has(campus.id)) errors.push(`校区 id 重复：${campus.id}`);
    ids.add(campus.id);
  }
  const defaultCampus = hasOwn(CAMPUSES, DEFAULT_CAMPUS_ID)
    ? CAMPUSES[DEFAULT_CAMPUS_ID]
    : null;
  if (!defaultCampus) {
    errors.push(`DEFAULT_CAMPUS_ID「${DEFAULT_CAMPUS_ID}」未注册`);
  } else if (defaultCampus.status !== 'active') {
    errors.push('DEFAULT_CAMPUS_ID 必须指向 active 校区');
  }
  if (!Object.values(CAMPUSES).some((campus) => campus.status === 'active')) {
    errors.push('至少需要一个 active 校区');
  }
  for (const result of results) {
    if (!result.ok) {
      errors.push(`校区「${result.campusId ?? '?'}」：${result.errors.join('；')}`);
    }
  }
  return { ok: errors.length === 0, errors, results };
}

/**
 * 校验场景构建器的返回值契约（validateSceneApi）。
 * 当前 js/campus-accurate.js 的 buildCampus() 返回值已满足该契约；
 * 未来每个校区的构建器都必须返回同样形状的对象（详见 docs/campuses.md）。
 *
 * @param {object} api 场景构建器返回值
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
export function validateSceneApi(api) {
  const errors = [];
  const warnings = [];
  if (!api || typeof api !== 'object') {
    return { ok: false, errors: ['场景构建器必须返回对象'], warnings };
  }
  if (!api.campus || typeof api.campus !== 'object') {
    errors.push('缺少 campus（场景根节点 THREE.Group）');
  } else if (api.campus.isObject3D !== true) {
    warnings.push('campus 看起来不是 THREE.Object3D（无法加入场景或释放）');
  }
  if (!Array.isArray(api.pickables)) {
    errors.push('pickables 必须是 THREE.Object3D 数组（供射线拾取）');
  }
  if (!api.landmarks || typeof api.landmarks !== 'object') {
    warnings.push('landmarks 映射建议提供（landmark id → THREE.Object3D）');
  }
  for (const method of SCENE_API_METHODS) {
    if (typeof api[method] !== 'function') errors.push(`缺少方法 ${method}()`);
  }
  if (typeof api.dispose !== 'function') {
    warnings.push('建议提供 dispose()：切换校区时释放几何体 / 材质 / 贴图，避免 GPU 内存泄漏');
  }
  return { ok: errors.length === 0, errors, warnings };
}

/* ========================================================================== */
/*  载入自检：注册表正确时静默；出错时在控制台明确报错（不影响页面继续运行）      */
/* ========================================================================== */

const startupCheck = validateRegistry();
if (!startupCheck.ok && typeof console !== 'undefined') {
  console.error(
    '[campuses] 校区注册表校验未通过：\n· ' + startupCheck.errors.join('\n· ')
  );
}
