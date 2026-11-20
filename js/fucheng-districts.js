import { SITE } from './site.js';

// OpenStreetMap WGS84, © OpenStreetMap contributors, ODbL 1.0.
// Keep the junior division and public streets in the senior model's coordinate system.
const [longitude, latitude] = SITE.center;
const metresPerDegree = 111320;
const local = (points) => points.map(([lng, lat]) => [
  (lng - longitude) * metresPerDegree * Math.cos(latitude * Math.PI / 180) * SITE.scale,
  (latitude - lat) * metresPerDegree * SITE.scale
]);

export const JUNIOR_SITE = {
  // OSM way 1013477322. The three-dimensional volumes are illustrative.
  outline: local([
    [110.3404642, 19.9961006], [110.3411813, 19.9949352], [110.3403064, 19.9944598],
    [110.3397548, 19.9941678], [110.3391322, 19.9940288], [110.3384228, 19.995115]
  ]),
  buildings: [
    // OSM ways 1444498478, 1444498481–1444498484 and 1444498493, respectively.
    [[110.3394592, 19.9952134], [110.3400734, 19.9955511], [110.3403495, 19.9951077], [110.3397353, 19.9947699]],
    [[110.3404409, 19.9953041], [110.3407413, 19.9954654], [110.3408015, 19.9953663], [110.3405011, 19.9952050]],
    [[110.3405777, 19.9950974], [110.3408647, 19.9952587], [110.3409263, 19.9951619], [110.3406393, 19.9950005]],
    [[110.3401190, 19.9958359], [110.3404275, 19.9960048], [110.3405362, 19.9958294], [110.3402278, 19.9956605]],
    [[110.3402826, 19.9955184], [110.3406206, 19.9957024], [110.3406773, 19.9956104], [110.3403393, 19.9954264]],
    [[110.3394404, 19.9955536], [110.3399393, 19.9959418], [110.3400018, 19.9958708], [110.3395029, 19.9954827]]
  ].map(local),
  // OSM way 1436332139. No adjacent university sports grounds are included.
  field: local([
    [110.3387776, 19.9946506], [110.3390651, 19.9941789], [110.3394359, 19.9943804], [110.3391635, 19.9948425]
  ]),
  center: local([[110.3399000, 19.9951800]])[0]
};

// OSM ways 392169514 and 977046394. Show only the street segment alongside the two divisions.
export const FUCHENG_STREETS = [
  {
    name: '高登西街', width: 6.6,
    points: local([
      [110.3387682, 19.9938418], [110.3391061, 19.9939119], [110.3394583, 19.9939726],
      [110.3397539, 19.9940653], [110.3400478, 19.9941846], [110.3403732, 19.9943454],
      [110.3407830, 19.9945661], [110.3421015, 19.9952512], [110.3426318, 19.9955291],
      [110.3432484, 19.9958436], [110.3436818, 19.9960683], [110.3438114, 19.9961365],
      [110.3442097, 19.9963242], [110.3444230, 19.9964129]
    ])
  },
  {
    name: '海中后街', width: 3.1,
    points: local([[110.3438114, 19.9961365], [110.3437286, 19.9962801], [110.3440480, 19.9966734]])
  }
];

export const JUNIOR_BOUNDS = {
  xMin: Math.min(...JUNIOR_SITE.outline.map(([x]) => x)),
  xMax: Math.max(...JUNIOR_SITE.outline.map(([x]) => x)),
  zMin: Math.min(...JUNIOR_SITE.outline.map(([, z]) => z)),
  zMax: Math.max(...JUNIOR_SITE.outline.map(([, z]) => z))
};

export const FUCHENG_BOUNDS = {
  ...SITE.bounds,
  xMin: Math.min(SITE.bounds.xMin, JUNIOR_BOUNDS.xMin),
  zMax: Math.max(SITE.bounds.zMax, ...FUCHENG_STREETS[0].points.map(([, z]) => z))
};

export const FUCHENG_VIEW = {
  position: [-65, 635, 250],
  target: [-49, 0, 103],
  fov: 39
};
