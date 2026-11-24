import { SITE } from './site.js';

// OpenStreetMap WGS84, © OpenStreetMap contributors, ODbL 1.0.
// Keep the junior division and public streets in the senior model's coordinate system.
const [longitude, latitude] = SITE.center;
const metresPerDegree = 111320;
const local = (points) => points.map(([lng, lat]) => [
  (lng - longitude) * metresPerDegree * Math.cos(latitude * Math.PI / 180) * SITE.scale,
  (latitude - lat) * metresPerDegree * SITE.scale
]);
/** Metres → scene units (the model uses 1 unit = 2 m). */
const toUnits = (metres) => metres * SITE.scale;
/** Compass-free angle (radians, +x east, +z south) of a segment. */
const segmentAngle = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);

/** Minimum-area rectangle of a polygon: { length, depth, angle, area }. */
function obbOf(poly) {
  let best = null;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const angle = segmentAngle(a, b);
    const c = Math.cos(-angle);
    const s = Math.sin(-angle);
    const rotated = poly.map(([x, z]) => [x * c - z * s, x * s + z * c]);
    const xs = rotated.map(([x]) => x);
    const zs = rotated.map(([, z]) => z);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...zs) - Math.min(...zs);
    if (!best || w * h < best.area) {
      const longAxis = w >= h ? angle : angle + Math.PI / 2;
      best = {
        length: Math.max(w, h),
        depth: Math.min(w, h),
        angle: Math.atan(Math.tan(longAxis)),
        area: w * h
      };
    }
  }
  return best;
}

/**
 * 体育场轮廓：直道 + 两端半圆，长轴朝 `angle`（弧度，+x 东，+z 南）。
 */
function stadiumOutline({ center: [cx, cz], angle, straight, radius, segments = 20 }) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const points = [];
  const push = (x, z) => points.push([cx + x * cos - z * sin, cz + x * sin + z * cos]);
  for (let i = 0; i <= segments; i += 1) {
    const a = -Math.PI / 2 + (Math.PI * i) / segments;
    push(straight + Math.cos(a) * radius, Math.sin(a) * radius);
  }
  for (let i = 0; i <= segments; i += 1) {
    const a = Math.PI / 2 + (Math.PI * i) / segments;
    push(-straight + Math.cos(a) * radius, Math.sin(a) * radius);
  }
  return points;
}

const OUTLINE_LONLAT = [
  [110.3404642, 19.9961006], [110.3411813, 19.9949352], [110.3403064, 19.9944598],
  [110.3397548, 19.9941678], [110.3391322, 19.9940288], [110.3384228, 19.995115]
];

// OSM ways 1444498478, 1444498481–1444498484 and 1444498493 — the six building
// footprints that fall inside the junior division boundary. The ten other ways in
// the neighbouring block (…485–…492) belong to the residential compound east of
// the school wall, so they are deliberately not part of the campus model.
//
// 楼名来自 2021 年 CSP-J/S 海南省考点平面图（CCF NOI 官网），位置按卫星影像对照。
const BUILDING_LONLAT = [
  {
    id: 'teaching', name: '初中部教学区', osm: 1444498478, storeys: 5, roof: 'flat',
    note: '南北教学翼与两侧连廊围合中庭，南向立面见 2026 年中考报道。',
    points: [[110.3394592, 19.9952134], [110.3400734, 19.9955511], [110.3403495, 19.9951077], [110.3397353, 19.9947699]]
  },
  {
    id: 'lab', name: '实验楼', osm: 1444498483, storeys: 4, roof: 'flat',
    note: '考点图标注「实验楼」，四楼设机房；层数按考点通知与实际高度推定。',
    points: [[110.3401190, 19.9958359], [110.3404275, 19.9960048], [110.3405362, 19.9958294], [110.3402278, 19.9956605]]
  },
  {
    id: 'office', name: '办公楼', osm: 1444498493, storeys: 4, roof: 'flat',
    note: '考点图标注「办公楼」，位于教学区西北侧；层数为示意。',
    points: [[110.3394404, 19.9955536], [110.3399393, 19.9959418], [110.3400018, 19.9958708], [110.3395029, 19.9954827]]
  },
  {
    id: 'block-north', name: '教学附属楼（北）', osm: 1444498484, storeys: 3, roof: 'pitched',
    points: [[110.3402826, 19.9955184], [110.3406206, 19.9957024], [110.3406773, 19.9956104], [110.3403393, 19.9954264]]
  },
  {
    id: 'block-east', name: '教学附属楼（东）', osm: 1444498482, storeys: 3, roof: 'pitched',
    points: [[110.3405777, 19.9950974], [110.3408647, 19.9952587], [110.3409263, 19.9951619], [110.3406393, 19.9950005]]
  },
  {
    id: 'block-south', name: '教学附属楼（东南）', osm: 1444498481, storeys: 3, roof: 'pitched',
    points: [[110.3404409, 19.9953041], [110.3407413, 19.9954654], [110.3408015, 19.9953663], [110.3405011, 19.9952050]]
  }
];

const buildings = BUILDING_LONLAT.map((building) => {
  const poly = local(building.points);
  const obb = obbOf(poly);
  return {
    ...building,
    poly,
    obb: { ...obb, center: [
      poly.reduce((sum, [x]) => sum + x, 0) / poly.length,
      poly.reduce((sum, [, z]) => sum + z, 0) / poly.length
    ] }
  };
});

export const JUNIOR_SITE = {
  // OSM way 1013477322. The three-dimensional volumes are illustrative.
  outline: local(OUTLINE_LONLAT),
  buildings,
  // OSM way 1436332139. No adjacent university sports grounds are included.
  field: local([
    [110.3387776, 19.9946506], [110.3390651, 19.9941789], [110.3394359, 19.9943804], [110.3391635, 19.9948425]
  ]),
  // Esri World Imagery 估绘：田径场东侧狭长活动带及教学楼前铺装。
  activityStrip: local([
    [110.3391222, 19.9950343], [110.3392778, 19.9951187], [110.3397345, 19.9943653], [110.3395835, 19.9942834]
  ]),
  entrancePlaza: local([
    [110.3399356, 19.9947538], [110.3401865, 19.9948899], [110.3403685, 19.9945987], [110.3401153, 19.9944613]
  ]),
  center: local([[110.3399000, 19.9951800]])[0]
};

// 影像北向估绘：外包约 109 m × 53 m。影像无法可靠辨认分道数量。
const juniorTrack = {
  center: local([[110.3391220, 19.9945220]])[0],
  angle: obbOf(JUNIOR_SITE.field).angle,
  radius: toUnits(26.5),
  straight: toUnits(28)
};
export const JUNIOR_TRACK = { ...juniorTrack, outline: stadiumOutline(juniorTrack) };

// 临街入口与教学楼前铺装沿同一轴线。门位对准影像中的入口，道宽为近似值。
export const JUNIOR_GATE = {
  point: JUNIOR_SITE.outline[2],
  angle: segmentAngle(JUNIOR_SITE.outline[3], JUNIOR_SITE.outline[1]),
  width: toUnits(24)
};


/**
 * 高初中通道：两校区之间最短的一对边界点。
 * 2021 年考点平面图把两区画成有通道相连；这里取两个校界顶点之间最近的距离，
 * 作为通道轴线（约 138 m，横跨两区之间的城市街区，走向与长度均为示意）。
 */
export const JUNIOR_LINK = (() => {
  // 高中部一侧：校界上离体育馆最近的顶点——体育馆南侧、食堂之间那条校道的起点。
  const gym = SITE.buildings.find((building) => building.name === '体育馆');
  const nearest = (points, target) => points.reduce((best, point) => (
    Math.hypot(point[0] - target[0], point[1] - target[1])
      < Math.hypot(best[0] - target[0], best[1] - target[1]) ? point : best
  ));
  const from = nearest(SITE.campusOutline, gym.center);
  // 初中部一侧：校界上离起点最近的顶点。
  const to = nearest(JUNIOR_SITE.outline, from);
  return {
    distance: Math.hypot(to[0] - from[0], to[1] - from[1]),
    from, to, width: toUnits(22)
  };
})();

export const JUNIOR_BOUNDS = {
  xMin: Math.min(...JUNIOR_SITE.outline.map(([x]) => x)),
  xMax: Math.max(...JUNIOR_SITE.outline.map(([x]) => x)),
  zMin: Math.min(...JUNIOR_SITE.outline.map(([, z]) => z)),
  zMax: Math.max(...JUNIOR_SITE.outline.map(([, z]) => z))
};

export const FUCHENG_BOUNDS = {
  ...SITE.bounds,
  xMin: Math.min(SITE.bounds.xMin, JUNIOR_BOUNDS.xMin),
  zMax: Math.max(SITE.bounds.zMax, JUNIOR_BOUNDS.zMax)
};

export const FUCHENG_VIEW = {
  position: [-65, 635, 250],
  target: [-49, 0, 103],
  fov: 39
};
