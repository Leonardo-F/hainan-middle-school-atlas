/**
 * 海南中学 · 府城校区（高中部）
 * 地景索引与叙事文本 —— 府城校区的「内容层」数据。
 *
 * 数据分层（多校区扩展约定）：
 *   1. 本文件 = 某个校区的叙事与元信息（校区身份、地标、导览顺序、文献来源、取景与主题）。
 *      不 import 任何空间数据或 Three.js，保持可在 Node 中直接 import 做校验。
 *   2. js/site.js = 同一校区的空间数据（OSM 轮廓、建筑、道路、运动场；1 场景单位 ≈ 2 米，北 = -z）。
 *   3. js/campuses.js = 校区注册表：把内容层 + 空间层 + 场景声明组装成 campus 条目，
 *      并负责 ?campus=<id> 解析、默认回退与 validateCampus 校验。
 *   4. js/campus-accurate.js = 当前唯一的场景构建器（仍硬编码府城校区内容，解耦步骤见 docs/campuses.md）。
 *
 * 空间骨架参考 OpenStreetMap 建筑轮廓、运动场与出入口数据（ODbL），
 * 在本地场景坐标中重建；部分建筑体量与细部为写意简化，不是测绘成果。
 *
 * 兼容性：main.js 目前仍直接 import { CAMPUS, LANDMARKS, TOUR_ORDER, SOURCES }，
 * 这些旧导出保持不变；新增的 FUCHENG_CAMPUS 是「campus 条目」数据（缺 site / scene，
 * 由 js/campuses.js 注入），CAMPUS_META 是校区身份字段的单一来源。
 */

/* ------------------------------------------------------------------ */
/*  校区身份（campus identity）                                        */
/*  所有「校区级」元信息的单一来源；新增校区时复制本结构即可。          */
/* ------------------------------------------------------------------ */

export const CAMPUS_META = {
  /** URL slug：?campus=fucheng。小写字母 / 数字 / 连字符，全局唯一。 */
  id: 'fucheng',
  /** active = 已上线可渲染；planned = 仅有元数据（明确未上线）。 */
  status: 'active',
  /** 校区切换器中的排序（府城 = 1，未来新校区依次递增）。 */
  order: 1,
  /** 学校名（跨校区共享）。 */
  school: '海南中学',
  /** 校区名（同一学校下的区分名）。 */
  name: '府城校区',
  /** 大字标题 / 小地图标注用的短名。 */
  shortName: '府城',
  schoolEn: 'HAINAN MIDDLE SCHOOL',
  en: 'FUCHENG CAMPUS',
  shortEn: 'FUCHENG',
  address: '海口市琼山区府城街道大路街 187 号',
  founded: '1923',
  /** 地理定位；与 js/site.js 的 SITE.center（[lng, lat]）保持一致。 */
  location: {
    city: '海口',
    district: '琼山',
    lng: 110.342611,
    lat: 19.9978342
  },
  summary: '海南中学高中部所在校区；1923 年建校，凤栖堂、衍林堂与教学组团沿北门主轴展开。'
};

/* ------------------------------------------------------------------ */
/*  旧版兼容导出（main.js 仍在直接使用）                               */
/* ------------------------------------------------------------------ */

export const CAMPUS = {
  name: CAMPUS_META.school,
  campus: CAMPUS_META.name,
  en: CAMPUS_META.schoolEn,
  enCampus: CAMPUS_META.en,
  address: CAMPUS_META.address,
  founded: CAMPUS_META.founded,
  overview: {
    // 场景卡片（设计画幅 1151×842 ≈ 1.371）中的概览取景：校园占宽约 88%、
    // 垂直居中，顶部留白给场景标题，底部不被控制条压住。
    position: [-150, 260, -230],
    target: [0, 0, -12],
    fov: 34
  },
  top: {
    position: [0, 390, 45],
    target: [0, 0, 0],
    fov: 39
  }
};

export const LANDMARKS = [
  {
    id: 'gate',
    index: '01',
    name: '校门',
    en: 'THE NORTH GATE',
    kind: '西北门 · 牌楼',
    year: '1988 / 按原貌扩建',
    anchor: [-39.3, 5.6, -74.31],
    camera: { position: [-50.9, 9.3, -91.8], target: [-39, 2.4, -74], fov: 38 },
    map: [-39.3, -74.31],
    diagram: 'gate',
    summary: '四柱三间，绿瓦飞檐。',
    description:
      '牌楼式校门位于校园西北侧、大路街入口附近，与凤栖堂、衍林堂所在的历史建筑片区相邻。四柱三间、绿瓦飞檐，门额上的「海南中学」四字出自古文字学家、书法家商承祚之手。1988 年海南建省后，校门按原有风貌扩建，成为府城校园最凝练的门面。',
    facts: [
      ['形制', '四柱三间 · 牌楼'],
      ['题额', '商承祚'],
      ['沿革', '1988 按原貌扩建']
    ]
  },
  {
    id: 'fengqi',
    index: '02',
    name: '凤栖堂',
    en: 'FENGQI HALL',
    kind: '省级文保 · 1934',
    year: '1934',
    anchor: [-46.3, 5.25, -50.2],
    camera: { position: [-34, 8.8, -32.1], target: [-46.2, 2.2, -50.5], fov: 38 },
    map: [-46.3, -50.2],
    diagram: 'fengqi',
    summary: '红柱白墙，绿琉璃瓦，夫子像静立庭前。',
    description:
      '凤栖堂建成于 1934 年 9 月，由旅泰华侨韩裕准捐资，以其父韩凤栖之名命名。建筑面宽 22.1 米、进深 12.5 米，绿琉璃瓦、红黄檐柱、白色墙面与黄色琉璃透花栏板相映，是一座融合海南传统与上世纪二三十年代南洋风格的中西合璧建筑。庭前立夫子像，地面为灰色石板铺装。2015 年被公布为海南省文物保护单位。',
    facts: [
      ['建成', '1934 年 9 月'],
      ['尺度', '面宽 22.1 m'],
      ['庭前', '夫子像 · 灰石铺地']
    ]
  },
  {
    id: 'yanlin',
    index: '03',
    name: '衍林堂',
    en: 'YANLIN HALL',
    kind: '纪念 · 公共集会',
    year: '北门内侧',
    anchor: [-0.3, 7.3, -80.7],
    camera: { position: [14.3, 7.6, -65], target: [0, 2.2, -81], fov: 43.8 },
    map: [-0.3, -80.7],
    diagram: 'yanlin',
    summary: '以首任校长钟衍林为名。',
    description:
      '衍林堂位于校园北门内侧，与凤栖堂同处府城校园的历史建筑片区。堂名取自海南中学首任校长钟衍林；校史中，堂前的「春风化雨——钟衍林和学生们」铜像定格了这位教育家与学生亲切交谈的场景。从开学典礼到校内公共事务，这里承载着一代代海中人关于仪式与共同记忆的片段。',
    facts: [
      ['命名', '首任校长钟衍林'],
      ['门前', '钟衍林与学生们铜像'],
      ['功能', '集会 · 讲演']
    ]
  },
  {
    id: 'hall1',
    index: '04',
    name: '1号教学楼',
    en: 'TEACHING HALL 01',
    kind: '教学组团 · 连廊',
    year: '校园东侧',
    anchor: [-0.4, 8.1, -30.7],
    camera: { position: [-27, 37, -86], target: [-4, 7, -36], fov: 46.1 },
    map: [-0.4, -30.7],
    diagram: 'main',
    summary: '楼前太湖石与百年大叶榄仁，楼后是「学园」。',
    description:
      '1号教学楼位于教学组团中部。楼前广场以太湖石「虎踞龙盘，捷报频传」和一棵著名的大叶榄仁树为标志；楼后与办公楼之间的「学园」，以一方写着「学」字的铺地连接两栋建筑。长排教室、连续外廊和楼梯间构成日常教学的秩序，也是从北门进入校园后最具方向感的一栋教学建筑。',
    facts: [
      ['类型', '连续教学楼'],
      ['层数', '五层'],
      ['标志', '虎踞龙盘太湖石 · 学园']
    ]
  },
  {
    id: 'science',
    index: '05',
    name: '科学馆',
    en: 'SCIENCE HALL',
    kind: '科学馆 · 艺术楼在后',
    year: '教学组团',
    anchor: [27, 8.7, -5.4],
    camera: { position: [-12, 28, -62], target: [27, 4, -2], fov: 43.8 },
    map: [27, -5.4],
    diagram: 'main',
    summary: '科学馆在后，艺术楼相连。',
    description:
      '科学馆位于教学组团中部，科学馆后侧是艺术楼。科学馆是浅色多层实验楼，艺术楼则是六层白色水平饰带、红瓦坡顶的体量；两者前后错落，形成校园东侧一组有明显层次的教学建筑。午后阳光越过红瓦与白色檐口，落在连廊、实验窗和艺术教室上，是府城校园里安静而清晰的一段日常。',
    facts: [
      ['功能', '实验教学 + 艺术教育'],
      ['艺术楼', '2015 · 约 7000 m²'],
      ['位置', '教学组团中部']
    ]
  },
  {
    id: 'gym',
    index: '06',
    name: '体育馆',
    en: 'GYMNASIUM',
    kind: '体育 · 大跨度屋盖',
    year: '校园西南',
    anchor: [-49.3, 7.4, 29.1],
    camera: { position: [-26, 17, 56], target: [-50, 3.1, 29], fov: 41.6 },
    map: [-49.3, 29.1],
    diagram: 'gym',
    summary: '运动场边的室内体育空间。',
    description:
      '体育馆位于运动场东南侧，是校园西南片区的公共体育建筑。大跨度屋盖、连续高窗与拱形入口，使它从周边教学楼中清晰地区分出来。校史中，胡文虎体育馆是早期校园的重要体育空间；今天，室内球场、体育课与课余锻炼在这里继续发生。',
    facts: [
      ['类型', '室内体育馆'],
      ['位置', '运动场东南侧'],
      ['记忆', '华侨兴学的体育传统']
    ]
  },
  {
    id: 'field',
    index: '07',
    name: '运动场',
    en: 'SPORTS FIELD',
    kind: '奔跑 · 校园西侧',
    year: '校园西侧',
    anchor: [-84.4, 1.2, -12.2],
    camera: { position: [-124, 10, -26], target: [-92, 0.8, -11], fov: 48.3 },
    map: [-84.4, -12.2],
    diagram: 'field',
    summary: '一圈红土色，收住校园的呼吸。',
    description:
      '运动场沿校园西侧展开，是府城校区最大的一片开阔地。环形跑道围住中央球场，四周被教学楼、体育馆与树木环绕。清晨的列队、傍晚的慢跑、球场边的欢呼都在这里发生；它也是整个校园图景中最容易辨认的一块颜色。',
    facts: [
      ['类型', '环形跑道 · 球场'],
      ['位置', '校园西侧'],
      ['时刻', '清晨与傍晚']
    ]
  },
  {
    id: 'tree',
    index: '08',
    name: '百年古树',
    en: 'CENTENNIAL TREE',
    kind: '古树 · 石桌石凳',
    year: '逾百年',
    anchor: [-1.41, 7.2, -48.44],
    camera: { position: [12, 8, -62], target: [-2, 2.2, -47], fov: 42.7 },
    map: [-1.41, -48.44],
    diagram: 'tree',
    summary: '巨大树冠下，石桌石凳围成一处阴凉。',
    description:
      '这株百年古树与 1号教学楼前的「虎踞龙盘」太湖石排在同一行，位于校门左侧、主楼的右前方。校史资料曾记为「大叶榄仁」；现场树冠巨大、气根垂落，许多校友把它看作校园里的大榕树。树下围着石桌石凳，是课间与傍晚最自然的一处停留。三维模型按巨大榕状古树表现，并补上石桌石凳。',
    facts: [
      ['树龄', '逾百年'],
      ['形态', '巨大榕状树冠'],
      ['树下', '石桌石凳']
    ]
  },
  {
    id: 'hall2',
    index: '09',
    name: '2号教学楼',
    en: 'TEACHING HALL 02',
    kind: '教学组团 · 连廊',
    year: '校园中部',
    anchor: [11.3, 7.0, -15.5],
    camera: { position: [33, 10, 4], target: [9, 2.2, -16], fov: 41.6 },
    map: [11.3, -15.5],
    diagram: 'main',
    summary: '与1号主楼平行展开的第二栋长教学楼。',
    description:
      '2号教学楼沿校园中部展开，与1号主楼平行。连续外廊、楼梯间和柱廊把普通教室串联起来；课间从连廊穿过，可以从教学区一直走到科学馆一侧。它与1号主楼之间的空地，正是以「学」字铺地为中心的学园。',
    facts: [
      ['类型', '连续教学楼'],
      ['层数', '四层'],
      ['位置', '1号主楼东南侧']
    ]
  },
  {
    id: 'hall3',
    index: '10',
    name: '第3教学楼',
    en: 'TEACHING HALL 03',
    kind: '教学组团 · H形平面',
    year: '校园南侧',
    anchor: [29.4, 9.5, 31.4],
    camera: { position: [75, 60, 80], target: [20, 0, 10], fov: 50.5 },
    map: [29.4, 31.4],
    diagram: 'main',
    summary: '教学组团南端的 H 形体量。',
    description:
      '第3教学楼位于科学馆南侧，以 H 形平面组织教室与连廊。红瓦屋面、横向窗带和几处楼梯间构成它清晰的节奏；从主楼穿过科学馆一侧走到这里，也正好完成了教学组团从北到南的一段序列。',
    facts: [
      ['类型', 'H形教学楼'],
      ['层数', '四层'],
      ['位置', '科学馆南侧']
    ]
  },
  {
    id: 'art',
    index: '11',
    name: '艺术楼',
    en: 'ART BUILDING',
    kind: '艺术教育 · 2015',
    year: '2015',
    anchor: [49.1, 12.7, 4.5],
    camera: { position: [75, 60, 80], target: [20, 0, 10], fov: 50.5 },
    map: [49.1, 4.5],
    diagram: 'main',
    summary: '六层白色饰带与红瓦坡顶。',
    description:
      '艺术楼位于教学组团东侧，建筑高度 23.5 米，建筑面积约 7000 平方米。白色水平饰带、红瓦坡顶和中央门廊，使它从周边教学楼中清晰地分辨出来。音乐、美术与艺术课程在这里展开，也是校园东侧一组有层次的建筑收束。',
    facts: [
      ['设计', '2015'],
      ['尺度', '约 7000 m² · 23.5 m'],
      ['外观', '白色饰带 · 红瓦坡顶']
    ]
  },
  {
    id: 'stream',
    index: '12',
    name: '曲水流觞',
    en: 'WINDING STREAM',
    kind: '水庭 · 艺术楼侧',
    year: '艺术楼旁',
    anchor: [59.2, 2.6, -4.5],
    camera: { position: [75, 60, 80], target: [20, 0, 10], fov: 50.5 },
    map: [59.2, -4.5],
    diagram: 'water',
    summary: '蜿蜒曲水，石桥与立石题名。',
    description:
      '艺术楼旁的水庭名为「曲水流觞」。水面分成数段，蜿蜒相接；沿岸以石岸收边，一座小石桥跨过水口，水边立石题名。芦苇、睡莲与树影一起，构成教学区东侧一处安静的水景。',
    facts: [
      ['类型', '曲水 · 石桥'],
      ['位置', '艺术楼旁'],
      ['题名', '曲水流觞']
    ]
  },
  {
    id: 'hand',
    index: '13',
    name: '手形雕塑',
    en: 'HAND SCULPTURE',
    kind: '校园雕塑 · 花坛',
    year: '教学庭院',
    anchor: [21, 3.2, -8],
    camera: { position: [21, 24, -28], target: [21, 0.8, -8], fov: 46.1 },
    map: [21, -8],
    diagram: 'sculpture',
    summary: '一双巨手捧起读书的学生。',
    description:
      '教学组团庭院里的一尊手形雕塑：两只向上托起的手掌围成一个小小的空间，中间坐着读书的学生。雕塑周围是低矮花坛与步道，是主楼到第3教学楼之间容易被忽略、却很有记忆点的一处细节。',
    facts: [
      ['类型', '手形雕塑'],
      ['位置', '教学庭院'],
      ['细节', '双手托举读书学生']
    ]
  },
  {
    id: 'study',
    index: '14',
    name: '学园',
    en: 'STUDY GARDEN',
    kind: '校园文化景观',
    year: '2015 校园景观',
    anchor: [7.1, 2.6, -22.2],
    camera: { position: [75, 60, 80], target: [20, 0, 10], fov: 50.5 },
    map: [7.1, -22.2],
    diagram: 'garden',
    summary: '1号主楼与后侧建筑之间的「学」字庭院。',
    description:
      '学园位于1号主楼与后侧建筑之间的空地，是2015年校园文化景观改造形成的「一池两馆三园」之一。地面以「学」字为主题铺装，四周以绿篱、树木和小径围合，既是从主楼穿向后侧建筑的一处停留，也是教学区中间安静的文化庭院。',
    facts: [
      ['类型', '文化庭院'],
      ['主题', '「学」字铺地'],
      ['位置', '1号主楼与后侧建筑之间']
    ]
  },
  {
    id: 'southgate',
    index: '15',
    name: '南门',
    en: 'THE SOUTH GATE',
    kind: '南入口 · 日常通行',
    year: '校园南侧',
    anchor: [57.13, 4.5, 84.34],
    camera: { position: [71, 7, 99], target: [57, 2.6, 84], fov: 39.3 },
    map: [57.13, 84.34],
    diagram: 'gate',
    summary: '南侧的城市界面，也是日常出入的一侧。',
    description:
      '南门位于校园南侧，面向高登西街与海中后街一侧的城市街区。与作为历史门面的西北门相比，南门更接近日常：上学、通勤、搬运与离校，都在这条更生活化的入口上发生。',
    facts: [
      ['方位', '校园南侧'],
      ['功能', '日常出入'],
      ['界面', '高登西街一侧']
    ]
  },
  {
    id: 'stone',
    index: '16',
    name: '虎踞龙盘',
    en: 'TIGER-DRAGON STONE',
    kind: '太湖石 · 2012',
    year: '2012',
    anchor: [-4.5, 1.9, -35.3],
    camera: { position: [-10, 4, -41.5], target: [-4.5, 1.6, -35.3], fov: 42 },
    map: [-4.5, -35.3],
    diagram: 'stone',
    summary: '九十三吨太湖石，虎踞龙盘，捷报频传。',
    description:
      '1号教学楼前广场上的太湖石，由82届初中、85届高中校友捐赠，重约93吨。石形如虎似龙，题字「虎踞龙盘，捷报频传」出自书法家吴东民之手。它与同一排的百年古树、石桌石凳一起，构成主楼前最重要的一处校园文化景观。',
    facts: [
      ['捐赠', '82届初中 · 85届高中校友'],
      ['重量', '约 93 吨'],
      ['题字', '虎踞龙盘 · 捷报频传']
    ]
  },
  {
    id: 'confucius',
    index: '17',
    name: '夫子像',
    en: 'CONFUCIUS STATUE',
    kind: '凤栖堂前 · 雕像',
    year: '凤栖堂前',
    anchor: [-42.9, 2.5, -46.0],
    camera: { position: [-35, 2.8, -47], target: [-43, 1.1, -46], fov: 46.1 },
    map: [-42.9, -46.0],
    diagram: 'statue',
    summary: '凤栖堂前，双手交叠、长须垂胸的夫子像。',
    description:
      '凤栖堂庭院中央立一尊夫子像：双手交叠于胸前，长须垂落，深色铜质，背后是绿琉璃瓦和红柱白墙。庭院采用灰色石板铺地，与塑像、修剪整齐的灌木共同形成一处安静的纪念空间。',
    facts: [
      ['位置', '凤栖堂前'],
      ['形象', '双手交叠 · 长须'],
      ['庭院', '灰色石板铺地']
    ]
  },
  {
    id: 'bronze',
    index: '18',
    name: '春风化雨铜像',
    en: 'SPRING BREEZE BRONZE',
    kind: '衍林堂前 · 群像',
    year: '衍林堂前',
    anchor: [5.2, 2.4, -74.1],
    camera: { position: [12, 2.8, -72], target: [5, 1.1, -74], fov: 46.1 },
    map: [5.2, -74.1],
    diagram: 'statue',
    summary: '钟衍林校长与学生们的一组铜像。',
    description:
      '衍林堂前的「春风化雨——钟衍林和学生们」铜像，定格了海南中学首任校长钟衍林与学生亲切交谈的场景。铜像立在灰色石质基座上，背后是衍林堂的柱廊和绿瓦屋顶。',
    facts: [
      ['人物', '钟衍林与学生们'],
      ['题名', '春风化雨'],
      ['位置', '衍林堂前']
    ]
  }
];

export const TOUR_ORDER = ['gate', 'fengqi', 'yanlin', 'hall1', 'science', 'gym', 'field', 'tree'];

export const SOURCES = [
  {
    label: 'OpenStreetMap：海南中学高中部及周边建筑轮廓（ODbL）',
    url: 'https://www.openstreetmap.org/way/1127981105'
  },
  {
    label: '海南日报：《一所中学的一个世纪 百年海中恰芳华》，2023-10-30',
    url: 'https://www.hinews.cn/news/system/2023/10/30/033065555.shtml'
  },
  {
    label: '海南中学凤栖堂修缮工程方案设计（官方公示 PDF）',
    url: 'https://www.haizhong.edu.cn/haizhong/2026-09/30/93b940346c1646f7914f3a66fa3f229d/2026100122220326696.pdf'
  },
  {
    label: '海南中学 2020 年高一新生入学须知（南门 / 北门）',
    url: 'https://www.haizhong.cn/haizhong/2022-12/19/article_2022121915013633139.html'
  },
  {
    label: '海南中学校园景观简介：一池两馆三园、学园与虎踞龙盘太湖石',
    url: 'https://www.haizhong.edu.cn/eportal/ui?pageId=8e153c4caa2f4f03b152da17e025da81&articleKey=817888f979f34a5db0a495727198d42d&columnId=8e153c4caa2f4f03b152da17e025da81'
  },
  {
    label: '中国建筑标准设计研究院：海南中学艺术楼（2015，7000 m²，23.5 m）',
    url: 'http://www.cbs.com.cn/case/202004241761.html'
  }
];

/* ------------------------------------------------------------------ */
/*  校区条目数据（campus entry）                                       */
/*  这是 js/campuses.js 组装 campus 条目的内容层；site（js/site.js 的  */
/*  SITE）与 scene（场景构建器声明）由注册表注入，因此本文件不依赖     */
/*  空间数据模块，可在 Node 中直接 import。                            */
/* ------------------------------------------------------------------ */

/**
 * 手机端取景覆盖（布局/取景参数，供 main.js 的 getOverviewView /
 * getTopView / getSpotView 使用；未提供时回退桌面取景）。
 * frameWidth 是 main.js 中 MOBILE_FRAME_WIDTH 表的等价数据：
 * 竖屏下希望地标在画面里占多少世界宽度（场景单位）。
 */
const FUCHENG_MOBILE = {
  overview: {
    position: [-230, 215, -390],
    target: [0, 0, -4],
    fov: 52
  },
  top: {
    position: [0, 720, 55],
    target: [0, 0, 0],
    fov: 52
  },
  frameWidth: {
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
    bronze: 13
  }
};

/**
 * 页面 / 小地图主题色。前 8 个键与 css/style.css 的 CSS 变量同名同值，
 * 供「切换校区时重写主题」或「按校区生成小地图」使用；
 * map 子对象保存当前 main.js drawMap() 里硬编码的小地图专用色。
 */
const FUCHENG_THEME = {
  paper: '#f2e9da',
  paperDeep: '#e7dcc9',
  ink: '#18261f',
  muted: '#677067',
  accent: '#b34c31',
  accentSoft: '#c98c68',
  gold: '#bd9b5a',
  forest: '#244a3b',
  map: {
    campus: '#738d65',
    track: '#9d5a43',
    court: '#64838a',
    courtAlt: '#769064',
    historic: '#9d5b43'
  }
};

export const FUCHENG_CAMPUS = {
  ...CAMPUS_META,
  /** 桌面端取景（沿用旧 CAMPUS 的同一个对象，避免两份相机参数漂移）。 */
  overview: CAMPUS.overview,
  top: CAMPUS.top,
  mobile: FUCHENG_MOBILE,
  theme: FUCHENG_THEME,
  /** 能力位：main.js 据此决定是否启用漫游 / 日照 / 导览 / 小地图 / 标注。 */
  features: {
    walk: true,
    weather: true,
    tour: true,
    minimap: true,
    labels: true
  },
  landmarks: LANDMARKS,
  tourOrder: TOUR_ORDER,
  sources: SOURCES,
  /** 数据与素材署名（active 校区必须保留 ODbL 署名）。 */
  license: {
    id: 'ODbL-1.0',
    attribution: '© OpenStreetMap contributors',
    url: 'https://www.openstreetmap.org/copyright',
    notice: '建筑轮廓、运动场与出入口来自 OpenStreetMap（ODbL 1.0）；高度、立面、植被与部分公共空间为艺术化推演，不是测绘成果。'
  }
};
