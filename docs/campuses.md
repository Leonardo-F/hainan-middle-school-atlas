# 多校区扩展指南 · 海南中学校园图志

> 目标读者：后续维护者 / 建模与前端协作者。
> 适用版本：2026-11-08（提交基线 `db61dd8`；`js/campuses.js`、`js/data.js` 的校区重构即本指南配套实现）。
> 现状：**府城校区（active）** 已上线；**美伦校区（planned）** 仅有元数据占位，明确未上线。

本指南说明三件事：

1. 数据层怎么分层：一个校区的「内容 / 空间 / 注册 / 场景 / 页面」各自负责什么；
2. 怎么新增一个校区：可执行的分步清单、坐标约定、性能与许可注意事项；
3. `js/main.js`、`js/campus-accurate.js`、`index.html` 未来要怎样接受 `campus` 参数（**本仓库当前不改这些文件**，由集成者按本文施工）。

---

## 目录

- [0. 30 秒速览](#0-30-秒速览)
- [1. 现状架构与数据分层](#1-现状架构与数据分层)
- [2. campus 条目契约](#2-campus-条目契约)
- [3. URL / 状态契约与集成点](#3-url--状态契约与集成点)
- [4. 新增校区可执行清单](#4-新增校区可执行清单)
- [5. 坐标、比例与北向约定](#5-坐标比例与北向约定)
- [6. 性能预算与移动端](#6-性能预算与移动端)
- [7. 素材、许可与署名](#7-素材许可与署名)
- [8. 自检与回归](#8-自检与回归)
- [9. FAQ](#9-faq)
- [附录 A. 字段速查表](#附录-a-字段速查表)
- [附录 B. 新增校区 PR 检查清单](#附录-b-新增校区-pr-检查清单)

---

## 0. 30 秒速览

新增一个校区 = **准备数据 → 生成 site.js → 写 landmarks → 建模 → 写场景构建器 → 注册 → 接入 main.js → 构建 → 验收**：

| 步骤 | 产物 | 关键约束 |
| --- | --- | --- |
| 0. 资料与许可 | OSM / 实测平面、官方资料、照片授权 | 记录来源与许可；不得编造 |
| 1. 本地坐标 | 换算脚本（一次性） | 1 场景单位 ≈ 2 米；x = 东，z = 南，北 = -z |
| 2. 空间数据 | `js/campuses/<id>/site.js`（或 `js/site-<id>.js`） | 轮廓 / 建筑 / 道路 / 运动场 / 球场 / 出入口 |
| 3. 叙事数据 | `js/campuses/<id>/data.js` | 每条地标有 id / anchor / camera / map / diagram / 文案 |
| 4. 重点建筑 | `js/campuses/<id>/landmarks/*.js` | 米制建模 + `finalize()`；`markSpot()` 注册拾取 |
| 5. 场景构建器 | `js/campuses/<id>/scene.js` | 返回 `SceneApi`（见 §2.6），不 import 全局 SITE |
| 6. 注册 | `js/campuses.js` 增加一个 `defineCampus({...})` | active 校区 `validateCampus()` 必须 0 error |
| 7. 接入 main.js | `SCENE_BUILDERS` 映射 + 路由 + 切换 | 见 §3 |
| 8. 构建 | `node build.mjs` 生成的 `hainan-middle-school.html` | **不要手写 / 手改构建产物** |
| 9. 验收 | 功能 + 性能 + 移动端 + 许可 | 见 §4 Step 9 与附录 B |

> 当前只有一个 active 校区，因此注册表 / 校验 / URL 契约已就绪，而**场景构建器仍只有 `js/campus-accurate.js` 一个**（内部硬编码府城内容）。第二个校区落地时，正是重构 `campus-accurate.js` 为「可传参构建器」的时机。

---

## 1. 现状架构与数据分层

### 1.1 文件职责

| 文件 | 层 | 职责 | 多校区要点 |
| --- | --- | --- | --- |
| `js/data.js` | 内容层（每校区一份） | 校区身份 `CAMPUS_META`、地标叙事 `LANDMARKS`、导览顺序 `TOUR_ORDER`、文献 `SOURCES`、取景 / 主题 / 能力位（`FUCHENG_CAMPUS`） | 不 import 空间数据与 Three.js，可在 Node 直接 import 校验 |
| `js/site.js` | 空间层（每校区一份） | `SITE`：OSM 整理的校园轮廓、建筑、道路、运动场、球场、出入口 | 1 场景单位 ≈ 2 米；x = 东，z = 南 |
| `js/campuses.js` | 注册表层（全局一份） | 导入各校区内容层 + 空间层，组装 `CAMPUSES`；`?campus=` 解析 / 回退；`defineCampus` / `validateCampus` / `validateRegistry` / `validateSceneApi` / `resolveSceneBuilder` | 新增校区只需在此加一条注册 + 一个构建器映射 |
| `js/campus-accurate.js` | 场景层（当前唯一构建器） | `buildCampus(scene, renderer, options)` 搭建府城三维场景 | **仍硬编码府城内容**；解耦清单见 §3.7 |
| `js/scene-kit.js` | 场景工具库 | 材质、植被、学生、通用建筑构件（`buildMaterials` / `createPalm` / `markSpot` …） | 可跨校区复用，不建议写校区专属内容 |
| `js/textures.js` | 材质库 | 程序化 Canvas 贴图（立面、屋瓦、铺地…） | 可复用；注意校区风格差异 |
| `js/landmarks/parts.js` | 建模构件库 | 米制建模构件 + `finalize()` + `SCENE_UNITS_PER_METER = 0.5` | 新校区重点建筑模型应复用 |
| `js/main.js` | 页面 / 交互层 | 相机、UI、小地图、导览、昼夜、URL 参数 | 需按 §3.5 改造为「先解析 campus，再构建场景 / UI」 |
| `index.html` | 结构层 | 页面骨架、品牌文案、加载页 | 品牌文案目前写死府城（见 §3.6），需数据化 |
| `build.mjs` | 构建 | Rollup 打包 `js/main.js` → 内联字体 / CSS → `hainan-middle-school.html` | 新 import 会被自动打包；动态 import 注意事项见 §6.4 |

### 1.2 数据流

```
             ┌───────────────────────────┐
             │ 每校区的内容层             │
             │ js/data.js（府城）         │
             │  CAMPUS_META               │
             │  LANDMARKS / TOUR_ORDER    │
             │  SOURCES                   │
             │  FUCHENG_CAMPUS            │
             └──────────────┬────────────┘
                            │  import
   ┌────────────────────────▼─────────────────────────┐
   │ js/campuses.js（注册表 + 路由契约）               │
   │  CAMPUSES / CAMPUS_LIST / ACTIVE_CAMPUSES        │
   │  getCampus / resolveCampus / parseCampusParam    │
   │  defineCampus / validateCampus / validateRegistry│
   └───────┬───────────────────────────────┬──────────┘
           │ import                         │ import
   ┌───────▼─────────────┐       ┌─────────▼─────────────────────┐
   │ 每校区的空间层       │       │ js/main.js（页面 / 交互）      │
   │ js/site.js（府城）   │       │ const campus = route.campus    │
   │  SITE               │       │ SCENE_BUILDERS[campus.scene.builder]│
   └───────┬─────────────┘       └─────────┬──────────────────────┘
           │ 注入 site                      │ 调用
   ┌───────▼──────────────────────────────▼──────────────────────┐
   │ 每校区的场景构建器                                           │
   │ js/campus-accurate.js（现状：硬编码府城）                    │
   │ 未来：js/campuses/<id>/scene.js（入参 campus / site / …）    │
   └──────────────────────────────────────────────────────────────┘
```

### 1.3 已就绪的注册表 API

```js
import {
  CAMPUSES,          // { fucheng, meilun }，id → frozen campus 条目
  CAMPUS_LIST,       // 冻结数组，active 在前、按 order 排序
  ACTIVE_CAMPUSES,   // 仅 active（校区切换器展示用）
  DEFAULT_CAMPUS_ID, // 'fucheng'

  getCampus,         // 注册表查询：已注册（含 planned）返回条目；未注册/空 → 默认校区
  resolveCampus,     // 路由解析：只返回可渲染 active 校区 + { requestedId, fallback, reason }
  parseCampusParam,  // 解析 window.location.search → { param, requestedId, campus, fallback, reason }
  buildCampusSearch, // 生成规范查询串（供 history.replaceState）

  defineCampus,      // 工厂：补默认值、按 status 给默认能力位、可 { validate: true } 失败即抛错
  createCampus,      // defineCampus 别名
  validateCampus,    // 单校区校验 → { ok, campusId, status, errors[], warnings[] }
  validateRegistry,  // 整表校验（含 key 一致性、默认校区可用性）
  validateSceneApi,  // 场景构建器返回值契约校验
  resolveSceneBuilder // (campusOrId, builders) → { campus, builder }，缺构建器时抛明确错误
} from './js/campuses.js';
```

`resolveCampus()` 的 `reason` 取值：

| reason | 触发条件 | campus 返回值 | 典型 UI 处理 |
| --- | --- | --- | --- |
| `'ok'` | 合法且 active（或显式 `allowPlanned: true`） | 请求的校区 | 正常渲染 |
| `'empty'` | 无参数 / 空字符串 | 默认校区 | 静默，不提示 |
| `'unknown'` | 未注册的 id | 默认校区 | toast「未知校区…」+ 清理 URL |
| `'planned'` | 已注册但 `status: 'planned'` | 默认校区 | toast「…尚未上线」+ 清理 URL |

---

## 2. campus 条目契约

一个 campus 条目 = **内容层数据 + 注入的空间层 `site` + 场景声明 `scene`**，由 `defineCampus()` 汇总为 frozen 对象。

### 2.1 顶层字段

| 字段 | 类型 | active 必填 | 说明 | 府城示例 |
| --- | --- | --- | --- | --- |
| `id` | string | ✅ | URL slug，`/^[a-z0-9][a-z0-9-]*$/` 全局唯一 | `'fucheng'` |
| `status` | `'active' \| 'planned'` | ✅ | active = 可渲染；planned = 仅元数据占位 | `'active'` |
| `order` | number | 建议 | 切换器排序 | `1` |
| `school` | string | ✅ | 学校名（跨校区共享） | `'海南中学'` |
| `schoolEn` | string | 建议 | 学校英文名 | `'HAINAN MIDDLE SCHOOL'` |
| `name` | string | ✅ | 校区名（区分名） | `'府城校区'` |
| `shortName` | string | 建议 | 大字标题 / 小地图短名 | `'府城'` |
| `en` | string | ✅ | 校区英文名 | `'FUCHENG CAMPUS'` |
| `shortEn` | string | 建议 | 英文短名 | `'FUCHENG'` |
| `fullName` | string | 自动派生 | `${school} · ${name}` | `'海南中学 · 府城校区'` |
| `fullEn` | string | 自动派生 | `${schoolEn} · ${en}` | `'HAINAN MIDDLE SCHOOL · FUCHENG CAMPUS'` |
| `address` | string | ✅ | 地址（地址栏 / 页脚使用） | `'海口市琼山区府城街道大路街 187 号'` |
| `founded` | string | 建议 | 建校 / 建校区年份 | `'1923'` |
| `location` | object | 建议 | `{ city, district, lng, lat }`，与 `SITE.center` 一致 | `{ city: '海口', district: '琼山', lng: 110.342611, lat: 19.9978342 }` |
| `summary` | string | 建议 | 一句话校区简介（切换器 / 分享卡） | 见 `data.js` |
| `overview` | `CampusView` | ✅ | 桌面端总览相机 | `{ position: [-165,140,-255], target: [0,0,-4], fov: 38 }` |
| `top` | `CampusView` | ✅ | 桌面端俯瞰相机 | `{ position: [0,390,45], target: [0,0,0], fov: 39 }` |
| `mobile` | object | 可选 | 手机端覆盖取景（见 §2.5） | `{ overview, top, frameWidth }` |
| `site` | object | ✅ | 空间数据（`js/site.js` 的 `SITE`），由注册表注入 | `SITE` |
| `landmarks` | array | ✅ | 地标叙事数据（§2.3） | 18 条 |
| `tourOrder` | string[] | ✅ | 自动导览顺序，元素必须是本校区 `landmark.id` | 8 条 |
| `sources` | array | ✅ | `{ label, url }[]`，文献与 ODbL 署名 | 6 条 |
| `theme` | object | 建议 | 页面 / 小地图主题色（§2.4） | 见下 |
| `features` | object | ✅ | 能力位：`walk / weather / tour / minimap / labels`（§2.4） | 全 true |
| `license` | object | 建议 | `{ id, attribution, url, notice }` | `ODbL-1.0` |
| `scene` | object | active 建议 | `{ builder, files? }`：`builder` 是 `SCENE_BUILDERS` 的键 | `{ builder: 'fucheng' }` |
| `note` | string | planned 建议 | 「未上线」说明与缺失数据 | 见美伦占位 |

`CampusView` 形状：

```js
{
  position: [x, y, z],  // 场景单位；y 向上
  target:   [x, y, z],
  fov: 38               // 垂直视场角（度）
}
```

`validateCampus()` 对相机的要求：`position/target` 各 3 个有限数字，`fov ∈ [10, 120]`。

### 2.2 `site` 空间数据契约

`SITE` 是**纯数据**（不依赖 Three.js），字段如下（以 `js/site.js` 现状为准）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `scale` | number | 米 → 场景单位的缩放。约定 `0.5`（1 场景单位 ≈ 2 米） |
| `center` | `[lng, lat]` | 本地坐标原点的 WGS84 位置；`location` 应与之对应 |
| `bounds` | `{ xMin, xMax, zMin, zMax }` | 场景可用范围（场景单位）；小地图取景与相机 clamp 依赖它 |
| `campusOutline` | `[x, z][]` | 校园红线多边形（≥ 3 点，建议闭合顺序、无重复首尾点） |
| `buildings` | `Building[]` | 建筑轮廓（见下） |
| `track` | `{ center: [x,z], size: [a,b], angle }` | 运动场跑道：中心、尺寸（场景单位）、旋转角（度） |
| `courts` | `Court[]` | 球场：`{ id, poly, center, size, angle, kind }`，`kind` 如 `basketball / volleyball` |
| `roads` | `Road[]` | 道路：`{ id, name, class, width, pts: [x,z][] }`，`class` 如 `service / secondary` |
| `gates` | `Gate[]` | 出入口点：`{ id, name, p: [x,z] }` |
| `northGate` / `southGate` | `{ p: [x,z], angle }` | 主要出入口（主界面 / 校门建模用），缺失会被 `validateCampus` 判错 |
| `heroTree` | `[x, z]` | 标志性古树位置（可选，府城用于百年榄仁树） |
| `attribution` | string | **ODbL 署名文本**，`validateCampus` 会提示缺失 |
| `name` | string | 空间数据名称（如「海南中学 · 府城校区（高中部）」） |

`Building` 字段：

```js
{
  id: '1165596671',            // 优先保留 OSM way id，便于溯源与 ODbL 署名
  name: '体育馆',              // 具名建筑；空地 / 附属体块可为 ''
  poly: [[x, z], ...],         // 轮廓（≥ 3 点；首尾不重复）
  center: [x, z],              // 轮廓中心（可直接用面重心）
  obb: [width, depth, angle],  // 外接旋转矩形；angle 单位度
  area: 2743.6,                // 面积（场景单位²）
  kind: 'named' | 'generic',
  style: 'gym' | 'yanlin' | 'fengqi' | 'academic' | 'generic'
}
```

> `style` 是**场景构建器的语义键**：构建器按它决定屋顶形式 / 立面做法。新校区请沿用现有键或与构建器作者约定新键，不要用 building `name` 做程序分支（现状 `campus-accurate.js` 仍有大量 `b.name === '1号教学楼'` 硬编码，重构时改为 `style` + `name` 配置表）。

### 2.3 `landmarks` 地标叙事契约

数组顺序即索引面板顺序；键盘 `1`–`8` 对应数组前 8 项（**不是** `index` 字段）。

| 字段 | 说明 |
| --- | --- |
| `id` | 唯一键，用于 `?spot=<id>`、`markSpot()`、拾取；建议小写短横线 |
| `index` | 展示编号字符串（`'01'`…），建议按数组顺序 `String(i+1).padStart(2, '0')` |
| `name` / `en` | 中文名 / 英文名（标记与信息卡排版） |
| `kind` | 类型短标签（如「省级文保 · 1934」） |
| `year` | 时间 / 方位短标签（自由文本） |
| `anchor` | `[x, y, z]` 场景单位：三维标记锚点（通常在建筑上方） |
| `camera` | `{ position, target, fov }`：点击地标后的取景（桌面端） |
| `map` | `[x, z]`：小地图点位（通常与 anchor 的 x/z 一致或取入口位置） |
| `diagram` | 信息卡示意图类型键：`gate / fengqi / yanlin / main / gym / field / tree / water / sculpture / garden / stone / statue`（由 `main.js` 的 `diagramSVG()` 渲染；新增类型需改 `main.js`） |
| `summary` | 一句话摘要（信息卡首行） |
| `description` | 段落叙述（信息卡正文） |
| `facts` | `[[label, value], ...]` 事实条目 |

**数据诚实原则**：`description` 中可核实的史实必须有 `sources` 支撑；写意推演的形制要在文案或项目说明中注明「非测绘 / 艺术化推演」。不要为「凑数」编造地标。

### 2.4 `theme` / `features` / `license`

```js
theme: {
  // 与 css/style.css 的 CSS 变量同名同值（页面换肤 / 切换校区时可直接写回 :root）
  paper: '#f2e9da', paperDeep: '#e7dcc9',
  ink: '#18261f', muted: '#677067',
  accent: '#b34c31', accentSoft: '#c98c68',
  gold: '#bd9b5a', forest: '#244a3b',
  // 小地图专用（当前 main.js drawMap() 仍硬编码这些色，集成后从这里取）
  map: {
    campus: '#738d65',   // 校园轮廓填充
    track: '#9d5a43',    // 跑道
    court: '#64838a',    // 球场（主）
    courtAlt: '#769064', // 球场（次 / 排球）
    historic: '#9d5b43'  // 历史建筑
  }
}
```

`features` 能力位决定 main.js 是否启用对应 UI / 逻辑（当前 main.js 未做 gating，接入时按下表实现）：

| 能力位 | true 时的行为 | 对应 DOM / 代码 |
| --- | --- | --- |
| `walk` | 启用 OrbitControls 自由漫游 | `setupSceneGraph()` / `#scene` |
| `weather` | 启用日照时刻滑块与昼夜切换 | `#timeRange` / `#nightButton` / `applyHour()` |
| `tour` | 启用自动导览按钮 | `#tourButton` / `startTour()` |
| `minimap` | 启用小地图绘制与点击定位 | `#minimap` / `drawMap()` |
| `labels` | 启用三维地标标记与索引 | `#markers` / `#index` / `setupUI()` |

`license` 示例：

```js
license: {
  id: 'ODbL-1.0',
  attribution: '© OpenStreetMap contributors',
  url: 'https://www.openstreetmap.org/copyright',
  notice: '建筑轮廓、运动场与出入口来自 OpenStreetMap（ODbL 1.0）；高度、立面、植被与部分公共空间为艺术化推演，不是测绘成果。'
}
```

### 2.5 `mobile` 手机端取景

`main.js` 现用 `getOverviewView() / getTopView() / getSpotView()` 在 `window.innerWidth <= 900` 时切换取景。多校区需按校区覆盖，建议由 `main.js` 读取：

```js
function getOverviewView(campus) {
  if (!isPhoneLayout()) return campus.overview;
  return campus.mobile?.overview ?? deriveMobileOverview(campus.overview); // 见 main.js 现状值
}

function getTopView(campus) {
  if (!isPhoneLayout()) return campus.top;
  return campus.mobile?.top ?? campus.top;
}

function getSpotView(spot, campus) {
  if (!isPhoneLayout()) return spot.camera;
  const frameWidth = campus.mobile?.frameWidth?.[spot.id] ?? 30; // 缺省 30 场景单位
  // …沿用现有竖屏 fit 算法
}
```

府城 `mobile.frameWidth` 已从 `main.js` 的 `MOBILE_FRAME_WIDTH` 原样迁入注册表（18 项），集成后应删除 main.js 里的硬编码表，避免两份数据漂移。

### 2.6 场景构建契约（SceneApi）

**入口签名（建议的未来契约）**：

```js
/**
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer} renderer
 * @param {{
 *   campus: Readonly<object>,   // 完整 campus 条目（含 theme/features/landmarks）
 *   site: object,               // campus.site，构建器唯一空间数据来源
 *   reducedMotion?: boolean,
 *   quality?: { shadows?: boolean, pixelRatioCap?: number }
 * }} options
 * @returns {SceneApi}
 */
export function buildCampusScene(scene, renderer, options) { … }
```

**返回对象契约**（`validateSceneApi()` 校验，当前 `js/campus-accurate.js` 的返回值已满足除 `dispose` 外的全部要求）：

| 键 | 类型 | 说明 |
| --- | --- | --- |
| `campus` / `world` | `THREE.Group` | 场景根节点（同引用）。`world.name` 应使用 `campus.fullName`，不要写死 |
| `pickables` | `THREE.Object3D[]` | 射线拾取对象；`userData.spot` 必须是 `landmark.id` |
| `landmarks` | `Record<string, THREE.Object3D>` | landmark id → 场景对象（选中高亮 / 调试用） |
| `setTime(hour)` | `(number) => void` | 设置日照时刻（`applyHour` 调用） |
| `getTime()` | `() => number` | 当前时刻 |
| `getNight()` | `() => number` | 夜程度 0..1（> 0.35 视为夜） |
| `tick(delta)` | `(number) => void` | 每帧动画（风摆 / 人物 / 旗帜…） |
| `updateBuildingLabels(camera)` | `(THREE.Camera) => void` | 建筑标签跟随相机 |
| `setSelection(spotId \| null)` | `(string\|null) => void` | 选中高亮环 |
| `hideSelection()` | `() => void` | 取消高亮 |
| `dispose()` | `() => void` | **新增要求**：切换校区时释放 geometry / material / texture / render target，`scene.remove(root)`，`renderer.renderLists.dispose()` |

当前 `campus-accurate.js` 的 `return`（基线提交 1831 行起）：

```js
return {
  campus: world, world, pickables,
  setTime, getTime: () => hour, getNight: () => night,
  tick: animate, updateBuildingLabels, setSelection,
  hideSelection: () => setSelection(null),
  landmarks: landmarkGroups
};
```

缺口：没有 `dispose()`；`world.name` 写死；`options` 只接受 `reducedMotion`；直接 import `SITE`。§3.7 给出解耦清单。

### 2.7 条目示例

**active（府城，实际由 `data.js` + `site.js` 组装）**：

```js
// js/campuses.js
const fuchengCampus = defineCampus({
  ...FUCHENG_CAMPUS,            // 来自 js/data.js（内容层）
  site: SITE,                   // 来自 js/site.js（空间层）
  scene: { builder: 'fucheng', files: { site: 'js/site.js', narrative: 'js/data.js', scene: 'js/campus-accurate.js' } }
}, { validate: true });
```

**planned 占位（美伦，禁止伪造空间数据）**：

```js
const meilunCampus = defineCampus({
  id: 'meilun', status: 'planned', order: 2,
  school: '海南中学', name: '美伦校区', shortName: '美伦',
  summary: '…尚未采集平面、叙事与模型数据。',
  note: '未上线（planned）：仅有元数据占位。缺少 site / landmarks / overview / sources / theme…'
}, { validate: true });
```

planned 条目**刻意没有** `site`、`landmarks`、`overview`、`sources`、`theme`、`scene`；`validateCampus()` 会把「planned 却提供 site/landmarks」判为 **error**，从机制上阻止编造。planned 校区的默认 `features` 全为 `false`。

---

## 3. URL / 状态契约与集成点

### 3.1 `?campus=<id>` 行为表

| 输入 | 解析结果 | `reason` | 页面行为 | URL 处理 |
| --- | --- | --- | --- | --- |
| `?campus=fucheng` | 府城 | `ok` | 正常渲染 | 默认校区，规范 URL 可省略参数 |
| 无参数 / `?campus=` | 府城 | `empty` | 正常渲染 | 不改写（首次进入保持原样） |
| `?campus=xxx`（未注册） | 府城 | `unknown` | 渲染府城 + toast 提示 | **建议** `replaceState` 清理非法参数 |
| `?campus=meilun`（planned） | 府城 | `planned` | 渲染府城 + toast「美伦校区尚未上线」 | **建议** 清理参数；上线后同一链接自然生效 |
| `?campus=FUCHENG` | 府城 | `ok` | 大小写不敏感（trim + lowercase） | 规范化为省略参数 |
| `?campus=构造函数`之类原型键 | 府城 | `unknown` | 回退 | 清理 |

规则：

1. **只有 active 校区会被渲染**；`planned` 只是注册表元数据。
2. id 只做 `trim + 小写` 归一化，**不做模糊/前缀匹配**（避免「fucheng」「fucheng2」歧义）。
3. 默认校区不写进 URL（规范 URL），分享链接只在非默认校区时带 `?campus=`。
4. 切换校区用 `history.replaceState`（不是 `pushState`）——图志是单页体验，不制造浏览器历史噪音；若产品希望支持后退，再改用 `pushState` + `popstate` 监听。
5. `?spot=` / `?view=` / `?hour=` 一律在**解析后的 campus 上下文**里校验；不属于该校区的地标 / 参数直接忽略（保留 URL 但不报错）。

### 3.2 回退提示文案（建议）

| reason | toast 文案 |
| --- | --- |
| `unknown` | `未知校区「${param}」，已回到${defaultCampus.name}` |
| `planned` | `${CAMPUSES[requestedId].name}尚未上线，先为你展示${defaultCampus.shortName}校区` |
| `empty` | 不提示 |

### 3.3 校区切换流程（推荐实现）

```js
async function switchCampus(nextId) {
  const route = resolveCampus(nextId);
  const next = route.campus;
  if (route.fallback) { showToast(/* §3.2 */); return; }   // 非法 / 未上线不切换
  if (state.campusId === next.id) return;

  // 1) 停掉交互与导览，关闭信息卡
  stopTour(); closeSpot({ stop: true }); cancelCameraTween();

  // 2) 卸载旧场景（GPU 资源必须释放）
  if (campus) {
    campus.dispose?.();
    scene.remove(campus.campus);
    campus = null;
  }
  for (const entry of markerEntries) entry.el.remove();
  markerEntries = [];
  indexList.innerHTML = '';
  // 主题变量（若用 theme 换肤）
  applyCampusTheme(next.theme);

  // 3) 重建 UI / 数据
  state.campusId = next.id;
  document.title = buildDocumentTitle(next);       // 见 §3.6
  const { site: SITE, landmarks: LANDMARKS, tourOrder: TOUR_ORDER, sources: SOURCES } = next;
  setupUI();                                        // 索引 / markers / sources 都由 next 数据生成
  applyFeatureFlags(next.features);                 // 隐藏不可用能力对应的 DOM

  // 4) 构建新场景
  const { builder } = resolveSceneBuilder(next, SCENE_BUILDERS);
  campus = builder(scene, renderer, {
    campus: next, site: SITE, landmarks: LANDMARKS,
    reducedMotion, quality: detectQuality()
  });

  // 5) 相机 / 状态归零
  state.activeId = null;
  state.hour = 16.3; state.dayHour = 16.3;
  camera.position.fromArray(next.overview.position);
  controls.target.fromArray(next.overview.target);
  camera.fov = next.overview.fov;
  camera.updateProjectionMatrix();
  controls.update();
  applyHour(resolveInitialHour(), { silent: true });
  renderer.shadowMap.needsUpdate = true;

  // 6) 规范 URL
  const search = buildCampusSearch(next.id, location.search); // 默认校区会自动去掉 campus 参数
  history.replaceState(null, '', `${location.pathname}${search}${location.hash}`);
}
```

> `SCENE_BUILDERS` 由 `main.js` 维护：
> ```js
> import { buildCampus as buildFuchengScene } from './campus-accurate.js';
> // 未来：import { buildCampus as buildMeilunScene } from './campuses/meilun/scene.js';
> const SCENE_BUILDERS = {
>   fucheng: buildFuchengScene,
>   // meilun: buildMeilunScene,
> };
> ```

### 3.4 main.js 集成点清单

> **行号说明**：以下行号基于提交 `db61dd8` 的原始 `js/main.js`。当前工作树正由布局协作者重写 `index.html` / `main.js`，行号会变；**请以函数名为准**，用编辑器搜索定位。集成原则不变：**先解析 campus，再取数据，再构建场景/UI**。

| 位置（基线行号） | 现状 | 改造 |
| --- | --- | --- |
| `js/main.js:3` | `import { buildCampus } from './campus-accurate.js'` | 保留构建器 import，加入 `SCENE_BUILDERS` 映射 |
| `js/main.js:4` | `import { SITE } from './site.js'` | **删除**；改为 `const { site: SITE } = ACTIVE_CAMPUS` |
| `js/main.js:5` | `import { CAMPUS, LANDMARKS, TOUR_ORDER, SOURCES } from './data.js'` | 改为 `import { parseCampusParam, buildCampusSearch, resolveCampus, resolveSceneBuilder } from './campuses.js'`，再解构 `ACTIVE_CAMPUS` |
| `js/main.js:16` | `const params = new URLSearchParams(...)` | 之后立刻 `const route = parseCampusParam(location.search); const ACTIVE_CAMPUS = route.campus;` 并处理回退提示 + `replaceState` |
| `desktopOverview`（`:86`） | `CAMPUS.overview` | `ACTIVE_CAMPUS.overview` |
| `MOBILE_FRAME_WIDTH`（`:92`） | 硬编码 18 项 | 删除；用 `ACTIVE_CAMPUS.mobile.frameWidth`（§2.5） |
| `getOverviewView()`（`:117`） | 桌面返回 `desktopOverview`，手机返回硬编码 | 读取 `ACTIVE_CAMPUS.mobile.overview`，无则回退 |
| `getTopView()`（`:126`） | `CAMPUS.top` | `ACTIVE_CAMPUS.top` + `mobile.top` |
| `getSpotView(spot)`（`:136`） | 使用 `MOBILE_FRAME_WIDTH` | 传入 campus，使用 `campus.mobile.frameWidth[spot.id]` |
| `setupSceneGraph()`（`:223`） | 初始相机 `[-280,235,-420]`、fov 38 写死 | 从 `ACTIVE_CAMPUS.overview` 推导起始位（或 `intro` 字段） |
| `setupIntroCamera()`（`:252`） | `params.get('spot')` 在 `LANDMARKS` 中查找 | 用解构后的 `LANDMARKS`（已属于解析后的 campus），逻辑不变 |
| `setupUI()`（`:328`） | `LANDMARKS.forEach` / `SOURCES` 渲染索引与来源 | 改为 `ACTIVE_CAMPUS.landmarks` / `.sources`（或把 setupUI 接收 campus 参数，便于切换时复用） |
| `handleKeyDown()`（`:562`） | 数字键 1–8 → `LANDMARKS[n-1]` | 解构后的 `LANDMARKS` 即可；注意只对前 8 项 |
| `openSpot()/stepSpot()/startTour()`（`:609/666/674`） | 使用 `LANDMARKS` / `TOUR_ORDER` | 同上；`startTour()` 的 toast「08 处校园地景」应改为 `TOUR_ORDER.length` 动态值 |
| `mapTransform()/drawMap()`（`:919/933`） | 使用 `SITE` 与硬编码色值 | `const SITE = ACTIVE_CAMPUS.site`；小地图配色改从 `ACTIVE_CAMPUS.theme.map` 取；`features.minimap === false` 时隐藏小地图 |
| `drawMap()` 建筑↔地标映射（`:1019` 附近） | 硬编码 5 组 `b.name === … ) && activeId === …` | 改为 `LANDMARKS.find((l) => l.name === b.name)`（现有 `site.buildings[].name` 与 landmark `name` 完全一致），或在校区数据中显式提供映射；「历史建筑」改用 `b.style`（`fengqi` / `yanlin`）而不是名字 |
| `drawMap()` 相机 clamp（`:1065`） | `SITE.bounds` | 同上，用解析后的 `SITE` |
| `handleMapClick()/handleMapHover()`（`:1100/1123`） | 使用 `LANDMARKS[].map` | 解构后的 `LANDMARKS` 即可 |
| `diagramSVG()`（`:1157`） | 固定 12 种图型、部分文案写死府城（「百年榄仁树」「虎踞龙盘」等） | 短期可复用；若新校区需要新图型，建议扩展为 `CAMPUS.diagrams?.[type]` 优先，`diagramSVG(type)` 作为兜底；至少让 `spot.diagram` 在新校区只使用通用图型 |
| `renderFrame()`（`:1555`） | `controls.target` clamp 写死 `[-145,145] / [-115,115]` | 改为 `SITE.bounds.xMin + 5 … xMax - 5` 等（§3.5 已使用 `SITE.bounds`） |
| `pickSpot()`（`:771`） | `campus.pickables` | 不变（构建器契约） |
| `resize()/applyHour()` | 不变 | 切换校区后需调用 `resizeMap()` / `renderer.shadowMap.needsUpdate = true` |
| `window.__campusReady` | 加载完成标志 | 切换校区时不要在页面生命周期内重置该全局（外部工具依赖） |

### 3.5 `index.html` 品牌文案数据化

`index.html` 中以下文案当前写死府城（行号为基线提交），接入后应由 `ACTIVE_CAMPUS` 填充（给元素加 `data-campus-slot`，或由 main.js 按选择器写入）：

| 基线行号 | 元素 / 内容 | 数据来源 |
| --- | --- | --- |
| `:7` | `<meta name="description">` | `ACTIVE_CAMPUS.summary` + 校名 + 项目说明 |
| `:8` | `<title>海南中学校园图志 · 府城校区三维校园` | `${ACTIVE_CAMPUS.school}校园图志 · ${ACTIVE_CAMPUS.name}三维校园` |
| `:32` | 加载页顶部「海南中学 · 府城校区」 | `${school} · ${name}` |
| `:78` | loading kicker `HAINAN MIDDLE SCHOOL · FUCHENG` | `${schoolEn} · ${shortEn}` |
| `:100` | masthead eyebrow「海南中学 · 府城校区」 | `${school} · ${name}` |
| `:104` | `<h1 class="masthead__title">府城</h1>` | `${shortName}` |
| `:125` | topbar「海口 · 府城」 | `${location.city} · ${shortName}`（`location` 可空则只显示 shortName） |
| `:250` | 页脚地址「大路街 187 号 / 写意复原 · 非测绘」 | 地址短名 + 固定「写意复原 · 非测绘」 |
| `:264` | about 说明「重访府城校区的日常」 | `${name}` 模板 |
| `:281` | about 页脚 `HAINAN MIDDLE SCHOOL · FUCHENG CAMPUS` | `${fullEn}` |
| `canvas aria-label`（`:17`） | 「海南中学府城校区交互三维模型…」 | `${fullName}交互三维模型…` |
| `#sourceList` | 由 `main.js setupUI()` 用 `SOURCES` 渲染 | `ACTIVE_CAMPUS.sources` |

**branding 接口建议**：在 `js/campuses.js` 增加纯函数（如 `campusBranding(campus)` 返回 title / description / eyebrow 等），由 main.js 统一写 DOM，避免在 HTML 里散落模板。当前未实现，属于接入阶段工作。

### 3.6 `campus-accurate.js` 解耦清单

现状（基线提交 `db61dd8`，行号）：

| 行 | 内容 | 问题 | 改造 |
| --- | --- | --- | --- |
| `:3` | `import { SITE } from './site.js'` | 构建器绑死府城空间数据 | 删除；从 `options.site` 读取 |
| `:18-21` | `SITE_GROUND_BOUNDS = {…SITE.bounds}` | 模块级常量绑死 | 移入 `buildCampus` 内，用 `options.site.bounds` |
| `:169` | `export function buildCampus(scene, renderer, options = {})` | 只接受 `reducedMotion` | 接受 `{ campus, site, landmarks, theme, features, reducedMotion, quality }`；未传 `site` 时抛错或回退 |
| `:181` | `world.name = '海南中学府城校区'` | 写死 | `world.name = options.campus.fullName` |
| `:634-1663` | 43 处 `SITE.` 引用 | 绑死 | 统一 `const SITE = options.site`（内部变量名可保留，减少 diff） |
| `:1033, 1040-1044, 1105, 1163-1175, 1231 起` | `b.name === '1号教学楼'` 等分支 | 建筑语义写死中文名 | 迁到校区配置表（如 `site/buildings` 增加 `style`、`floors`、`roof` 等字段，或 `campus.scene.buildingStyles` 映射）；短期至少集中到一个函数/表 |
| `:822, 852-902, 970, 1163-1175, 1292, 1523` | `landmarkGroups` / `markSpot(group, 'hall1', …)` 写死府城地标 id | 换校区即失效 | 由 `options.landmarks` 驱动：`markSpot(group, landmark.id)`，在校区配置中声明「建筑名 → landmark id」 |
| `:1831-1843` | `return { campus: world, … }` | 缺 `dispose()`；`updateBuildingLabels` 内部逻辑依赖府城 | 增加 `dispose()`；标签逻辑参数化 |
| 全文 | 植被随机种子 `mulberry32(20261019)`（`:14`）、学生路线、道路、围墙、牌坊… | 府城专属内容混入通用构建器 | 长期拆为：`scene-core.js`（地面/天空/光照/通用建筑外壳）+ 每校区 `scene.js`（专属道路/植被/雕塑/学生路线） |

**推荐拆分（未来）**：

```
js/scene/
  contract.js        // SceneApi 约定 + 通用 dispose 工具
  core.js            // 天空 / 光照 / 地面 / 相机预设 / 通用建筑外壳
js/campuses/fucheng/
  site.js            // 现在 js/site.js 迁入
  data.js            // 现在 js/data.js 迁入
  landmarks/*.js     // 现在 js/landmarks/* 迁入
  scene.js           // 现在 js/campus-accurate.js 改造
js/campuses/<id>/…   // 新校区同构
```

在当前阶段（只有一个 active 校区）**不需要**立即拆分；第二个校区立项时按上表改造即可，注册表字段无需变化（`scene.builder` + `scene.files` 已预留）。

---

## 4. 新增校区可执行清单

> 以下以「新增 `<id>` 校区」为例。示例命令都在仓库根目录执行；不要提交临时脚本（放 `/tmp`）。

### Step 0 · 资料与许可准备

- [ ] 确定校区范围：官方名称、地址、建校年份、与学校的关系；
- [ ] 获取平面数据：
  - 优先 OpenStreetMap（`building` / `leisure=track` / `leisure=pitch` / `highway` / `entrance`），记录 **way id 与抓取日期**；
  - 或使用校方公开的总平面图 / 实测数据（需授权，注意成果保密与版权）；
  - 记录数据许可以及 `© OpenStreetMap contributors, ODbL 1.0` 署名要求（见 §7）。
- [ ] 收集叙事资料：校史、文保信息、建筑尺度、校园文化景观；每条事实记下出处，填进 `sources`。
- [ ] 收集建模参考：有授权的照片 / 官方图集（**不要**直接把官方照片打进产品，除非许可允许）。
- [ ] 明确「本次做到什么程度」：是完整图志（≥ 8 地标 + 重点建筑模型），还是只做总平面（仅注册 `site` + 少量 landmark）。

### Step 1 · 建立本地坐标

约定（与府城一致，务必遵守，否则相机 / 小地图 / 建模全部对不上）：

- **1 场景单位 ≈ 2 米** → `SITE.scale = 0.5`（米 × 0.5 = 场景单位）；
- **x = 东（+x 向东）**，**z = 南（+z 向南）**，因此**北 = -z**；y = 上；
- 平面数据用 `[x, z]`，Three.js 场景坐标用 `[x, y, z]`；
- 原点通常选校区几何中心或主入口；把原点经纬度写入 `SITE.center = [lng, lat]`，并与 `campus.location` 保持一致。

一次性换算脚本（建议放 `/tmp/convert-<id>.mjs`，不要提交）：

```js
const ORIGIN = { lng: 110.342611, lat: 19.9978342 };       // 写入 site.center
const SCALE = 0.5;                                          // 1 场景单位 ≈ 2 米
const M_PER_DEG_LAT = 110540;                               // 20°N 附近近似
const M_PER_DEG_LNG = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180);
const r2 = (v) => Math.round(v * 100) / 100;                // 0.01 场景单位 ≈ 2 cm

function toScene([lng, lat]) {
  return [
    r2((lng - ORIGIN.lng) * M_PER_DEG_LNG * SCALE),
    r2(-(lat - ORIGIN.lat) * M_PER_DEG_LAT * SCALE)         // 北 = -z
  ];
}
```

> 小范围内用等距近似即可（校园尺度 < 2 km，误差可忽略）。若平面来自 CAD / 实测，直接以米为单位 `× 0.5`，无需经纬度。

自检：取两个已知距离的点（如跑道两端），换算后的场景距离 × 2 ≈ 实际米数。

### Step 2 · 生成 `site.js`

新校区建议放在 `js/campuses/<id>/site.js`（与府城现状的 `js/site.js` 同构）：

```js
// js/campuses/<id>/site.js
export const SITE = {
  scale: 0.5,
  center: [/* lng */, /* lat */],
  bounds: { xMin: -150, xMax: 150, zMin: -120, zMax: 120 },
  campusOutline: [[x, z], /* … ≥ 3 点 */],
  buildings: [
    {
      id: 'OSM way id', name: '建筑名', poly: [[x, z], /* … */],
      center: [x, z], obb: [width, depth, angle], area: 0,
      kind: 'named', style: 'academic'
    }
  ],
  track: { center: [x, z], size: [a, b], angle: 0 },
  courts: [{ id, poly, center, size, angle, kind: 'basketball' }],
  roads: [{ id, name: '', class: 'service', width: 4.2, pts: [[x, z], /* … */] }],
  gates: [{ id, name: '主门', p: [x, z] }],
  northGate: { p: [x, z], angle: 0 },
  southGate: { p: [x, z], angle: 0 },
  heroTree: [x, z],
  attribution: '© OpenStreetMap contributors (ODbL). Building footprints and entrances are simplified from OSM data, retrieved YYYY-MM.',
  name: '海南中学 · <校区名>'
};
```

注意：

- `bounds` 要覆盖所有可见对象（含围墙 / 道路 / 跑道），小地图与相机 clamp 依赖它；
- 道路按 `class` 决定线宽（见 `main.js drawMap()`），校园内部道路通常 `service`；
- `poly` 首尾不重复；坐标统一保留两位小数；
- **每个 named 建筑的 `name` 建议与地标 `name` 一致**（小地图高亮会按名字匹配；更稳的做法见 §3.4 的映射改造）；
- 命名 / 修缮状态不确定的附属体块用 `kind: 'generic'`，不要编造名字。

### Step 3 · 叙事数据 `landmarks` / `tourOrder` / `sources`

新校区 `js/campuses/<id>/data.js` 结构参考 `js/data.js` 的 `FUCHENG_CAMPUS`：

```js
export const CAMPUS_META = { id, status: 'active', order, school, name, …, location, summary };
export const LANDMARKS = [ /* §2.3 字段 */ ];
export const TOUR_ORDER = ['gate', 'hall1', /* …必须是 LANDMARKS 的 id */];
export const SOURCES = [{ label, url }];
export const <ID>_CAMPUS = { ...CAMPUS_META, overview, top, mobile, theme, features, landmarks: LANDMARKS, tourOrder: TOUR_ORDER, sources: SOURCES, license };
```

要点：

- 地标数量建议 6–18 条；`index` 用 `'01'` 两位字符串；`tourOrder` 建议 6–10 条；
- `anchor` / `map` 坐标必须与 `site` 对齐（用同一换算脚本，或在 Three.js 场景里点选核对）；
- `camera` 先在浏览器里手工调好（或写脚本生成俯视取景），保证目标居中、不被前景遮挡；
- **图型复用**：优先用现有 `diagram` 类型（`gate/main/field/stone/statue/garden/water` 等通用型）；府城专属图型（`fengqi` / `yanlin` / `gym` / `tree`）审慎复用，新类型需改 `main.js diagramSVG()`；
- `sources` 至少 3 条：平面数据（OSM/校方）+ 校史/官方资料 + 建模参考。

### Step 4 · 重点建筑模型

- 位置：`js/campuses/<id>/landmarks/<building>.js`（构件库在 `js/landmarks/parts.js`）；
- **本文件内用米建模**，最后调用 `finalize(group)`：自动缩放到场景单位（`SCENE_UNITS_PER_METER = 0.5`）、合并静态网格、开启阴影；
- 建筑局部坐标：`+z` 为正面，`+x` 为长向，基座 `y = 0`；
- 集成时负责把 group 放到校园坐标（旋转 / 平移），并 `markSpot(group, '<landmark-id>', pickables)`；
- 复用件：`addChineseRoof` / `addGableRoof` / `addWindowWall` / `addRailing` / `addStoneLion` / `addSteps` / `addPlaque` / `addFigure` 等；
- 性能：单栋重点建筑建议 < 80k 三角形；共享几何体与材质；避免每栋独立贴图（优先程序化材质）；
- 参考作品 `/Users/fangaoming/Downloads/Hainan_Campus_3D.html` 的模块拆分（`world.js` / `campus.js` / `site-footprints.js`）可借鉴，但**不要直接复制其素材**（许可不明）。

### Step 5 · 场景构建器

首选做法：**复制 `js/campus-accurate.js` → `js/campuses/<id>/scene.js` 改造**，而不是在原文件里加 if。改造顺序：

1. 删除 `import { SITE }`，改从 `options.site` 取；
2. 删除模块级 `SITE_GROUND_BOUNDS`，改函数内 `const bounds = site.bounds`；
3. `buildCampus(scene, renderer, { campus, site, landmarks, theme, features, reducedMotion })`；
4. 建筑语义（层数 / 屋顶 / 造型）改为按 `site.buildings[].style` 或校区配置表选择；
5. 地标分组由 `landmarks` 数组驱动（`markSpot(group, landmark.id)`），删除 `'hall1'` 等写死 id；
6. 校区专属内容（道路涂装、围墙、牌坊、学生路线、雕塑、水庭、植被密度）留在本校区 scene 内；
7. 实现 `dispose()`：遍历根节点回收 geometry/material/texture，`scene.remove(root)`，`renderer.renderLists.dispose()`；
8. `world.name = campus.fullName`；
9. 导出 `buildCampus`（或 `buildCampusScene`，名称与 `SCENE_BUILDERS` 对齐）。

通用部分（天空 / 光照 / 地面 / 通用建筑外壳 / 材质初始化）可留在 `js/campus-accurate.js` 里逐渐抽成 `js/scene-core.js`，供各校区 import——这一步不阻塞第二个校区上线。

### Step 6 · 注册

在 `js/campuses.js` 中：

```js
// 1) import 新校区内容层 + 空间层
import { SITE as MEILUN_SITE } from './campuses/meilun/site.js';
import { MEILUN_CAMPUS } from './campuses/meilun/data.js';

// 2) 组装（validate: true 会在校验失败时直接抛错，尽早暴露数据问题）
const meilunCampus = defineCampus({
  ...MEILUN_CAMPUS,
  site: MEILUN_SITE,
  scene: { builder: 'meilun', files: { site: 'js/campuses/meilun/site.js', … } }
}, { validate: true });

// 3) 加入注册列表（保持 planned 条目也在）
export const CAMPUSES = Object.freeze(Object.fromEntries([
  fuchengCampus, meilunCampus, /* <新校区> */
].map((campus) => [campus.id, campus])));
```

> 若新校区尚未上线：先注册为 `status: 'planned'`（只填元数据 + `note`），等 §4 Step 9 全部通过后再改 `active`。`validateCampus()` 会阻止 planned 校区携带 `site` / `landmarks`。

### Step 7 · 接入 main.js

按 §3.3–§3.5 改造：路由解析 → 数据解构 → `SCENE_BUILDERS` → 品牌文案 → 能力位 gating → 切换流程。建议拆成两个 PR：

1. **数据接入 PR**：main.js 只改为「从注册表取府城数据」，行为与现在完全一致（可用 `?campus=fucheng` 回归）；
2. **切换 UI PR**：加校区切换器（可用 `ACTIVE_CAMPUSES` 渲染；planned 校区显示「未上线」禁用态）。

### Step 8 · 构建

```bash
node build.mjs   # 生成 hainan-middle-school.html（单文件、可 file:// 打开）
```

- 构建脚本从 `index.html` 移除 `css/style.css` / `js/main.js` 引用并内联，改 `index.html` 结构时注意保留这些标记行（`build.mjs` 会做存在性检查，失败会报错）；
- 新 import 的模块会被自动打包；**动态 import 注意**：`format: 'iife'` 不支持 code-splitting，若引入 `import()` 需在 `build.mjs` 的 `bundle.generate()` 增加 `inlineDynamicImports: true`（等价于全部内联），否则构建报错；
- 产物大小基线（改动前）：`hainan-middle-school.html` ≈ **1.52 MB**，gzip ≈ **428 KB**；新校区上线后关注增量（见 §6）。

### Step 9 · 验收清单

| 类别 | 检查项 |
| --- | --- |
| 语法 | `node --check js/data.js js/campuses.js js/campuses/<id>/*.js` 全部通过 |
| 数据 | 临时脚本：`validateRegistry().ok === true`；`getCampus('<id>')` 字段完整；`validateSceneApi()` 通过 |
| URL | `?campus=<id>` 正常；未知 id 回退 + toast + URL 清理；默认校区 URL 不带参数；`?spot=` / `?view=top` / `?hour=` 正确 |
| 场景 | 无 console error；地面 / 建筑 / 跑道 / 球场 / 出入口 / 围墙不穿插；坐标系与北向正确 |
| 地标 | 索引数量与顺序、marker 锚点、点击拾取、信息卡图型、键盘 1–8、导览顺序 |
| 小地图 | 轮廓 / 道路 / 跑道 / 球场 / 建筑 / 出入口 / 当前视野锥正确；点击定位 |
| 昼夜 | 时刻滑块、窗户灯光、路灯、天空雾效、阴影更新 |
| 响应式 | ≤ 900px 手机布局、竖屏取景、触摸手势、信息抽屉、安全区 |
| 性能 | 首屏可交互时间、帧率、draw calls、三角形数、内存（§6） |
| 许可 | about 对话框与 sources 中显示 ODbL 署名与数据日期；无未授权照片 / 字体 / 模型 |
| 构建 | `node build.mjs` 成功；产物 `file://` 打开可用；不手改产物 |

---

## 5. 坐标、比例与北向约定

| 约定 | 值 | 说明 |
| --- | --- | --- |
| 比例 | `SITE.scale = 0.5` | 1 场景单位 ≈ 2 米；米制数据 × 0.5 得场景单位 |
| 东向 | `+x` | 经纬度增大方向（东） |
| 南向 | `+z` | 纬度减小方向（南） |
| 北向 | `-z` | 地图上「上北」= 场景 `-z` |
| 高度 | `+y` | 米制高度同样 × 0.5（如 3.6 m 层高 ≈ 1.8 场景单位，见 `FLOOR = 1.8`） |
| 平面点 | `[x, z]` | `site.campusOutline / poly / pts / map / p` 等 |
| 三维点 | `[x, y, z]` | `anchor / camera.position / camera.target` |
| 角度 | 度（°） | 运行时代码内部再转弧度；跑道 / 球场 / 出入口的 `angle` 请沿用同一转换脚本，不要手调 |
| 相机 | fov 为垂直视场角 | 桌面 `overview.fov` 38–39；手机 `fov` 52 |

**尺度自检**：换算后取两个已知点（跑道直道两端 / 主楼两端），`距离 × 2` 应接近真实米数；偏差 > 10% 说明经纬度换算或原点选错。

**建筑高度**：`site.buildings` 不含高度（高度由场景构建器按 `style` / 楼层推演）。新增校区可在 `Building` 上**扩展** `floors` / `height` / `roof` 字段（纯数据、向后兼容），但需同时修改构建器读取；不要在 data.js 里另存一份建筑高度。

---

## 6. 性能预算与移动端

### 6.1 当前基线（改动前，2026-11-08）

| 指标 | 数值 |
| --- | --- |
| 单文件构建产物 | ≈ 1.52 MB（`hainan-middle-school.html`），gzip ≈ 428 KB |
| Three.js 本体 | `vendor/three.module.js` ≈ 1.30 MB（r169，MIT） |
| 字体 | 6 个 woff2，合计 ≈ 150 KB（构建时内联） |
| 阴影 | 单方向光，shadow map **2048²**，`shadowMap.autoUpdate = false`（仅时刻变化时重算） |
| 像素比 | `min(devicePixelRatio, 1.5)` |
| 贴图 | 全部 Canvas 程序化生成，无外部图片；无网络请求 |
| 场景相机 | `far = 3200`，`maxDistance = 1100`，fov 38 |

### 6.2 新增校区预算（建议上限）

| 指标 | 桌面目标 | 移动端目标 | 备注 |
| --- | --- | --- | --- |
| 新增 draw calls | ≤ 250 | ≤ 150 | 尽量合并静态网格（`parts.js finalize()` 已做） |
| 新增三角形 | ≤ 350k | ≤ 200k | 重点建筑单栋 < 80k |
| 新增贴图显存 | ≤ 32 MB | ≤ 24 MB | 优先程序化贴图；单张 Canvas ≤ 1024² |
| 新增 JS（未压缩） | ≤ 150 KB | — | 场景代码可接受；数据（site）建议 < 60 KB |
| 单文件构建增量 | ≤ 300 KB | — | 总产物建议 ≤ 2.2 MB（gzip ≤ 650 KB） |
| 首屏可交互 | ≤ 4 s（中端桌面） | ≤ 6 s（中端手机） | 本地 HTTP / 同网 CDN；`?nointro` 可跳过 1.35 s 最短加载动画 |

### 6.3 移动端策略

- 保持 `setPixelRatio(min(dpr, 1.5))`；低端设备可按 `features` / 媒体查询降到 1.25；
- 阴影：每校区共享一张 2048 shadow map；移动端可降至 1024（由 `quality` 参数控制）；
- 远处建筑 / 树木用简化体块或 InstancedMesh；植被避免每棵独立材质；
- 竖屏取景统一走 `campus.mobile`（不要在校区代码里写 `if (手机)`）；
- 切换校区时务必 `dispose()` 旧场景，否则 GPU 内存随切换次数线性增长。

### 6.4 多校区加载策略

- **注册表保持轻量**：`js/campuses.js` 只 import 内容层（纯数据）；**不要**在注册表顶层 import 场景构建器（会把 Three.js 场景代码全部拉进首屏）；
- 开发版可用动态 import 懒加载场景构建器：`const { buildCampus } = await import('./campuses/<id>/scene.js')`；
- **单文件构建**（`format: 'iife'`）时动态 import 会被要求内联：`build.mjs` 需加 `inlineDynamicImports: true`，或者直接静态 import 所有构建器（更简单，代价是体积）；
- 校区数量 > 3 时再考虑真正的按需加载（多文件部署 / 保留 `hainan-middle-school.html` 单文件版作为离线分发）。

---

## 7. 素材、许可与署名

| 素材 | 许可 / 义务 | 落地要求 |
| --- | --- | --- |
| OpenStreetMap 数据 | **ODbL 1.0** | 页面显示 `© OpenStreetMap contributors` + 许可链接；`site.attribution` 写清抓取日期；`sources` / about 对话框同步；衍生数据库如对外分发需遵守 ODbL 共享条款，不得暗示 OSM 背书 |
| 校方 / 第三方照片 | 默认受版权保护 | 需书面授权或使用可商用授权素材；记录来源与许可；**不要**直接内联官方图集照片 |
| 字体 | 项目自带 6 个 woff2（OFL/自用字体子集） | 新增字体需确认 OFL 或可嵌入许可；构建会内联字体 |
| Three.js / OrbitControls | MIT | 保留版权声明（`vendor/` 内已有） |
| 参考作品 `/Users/fangaoming/Downloads/Hainan_Campus_3D.html` | 许可不明 | 仅作结构与工艺参考，**不得复制其模型 / 贴图 / 代码片段** |
| 自建模型 / 程序化贴图 | 项目自有 | 在 `sources` 或文档中记录生成方式（脚本 / 手写） |

署名位置（接入后应同时满足）：

1. `campus.license.attribution` 字段；
2. `sources` 列表（about 对话框 `#sourceList`）；
3. 页面 about 免责声明（「本页面为非官方数字文化项目…建筑轮廓数据 © OpenStreetMap contributors，ODbL 1.0」）；
4. 新增校区的 OSM way id 保留在 `site.buildings[].id`，便于溯源。

**数据诚实**：`description` 等叙事文案中的史实要能追溯到 `sources`；推演内容（高度、立面、植被）在项目说明中统一标注「艺术化推演，非测绘成果」。`planned` 校区禁止填充任何空间 / 叙事数据（`validateCampus` 强制）。

---

## 8. 自检与回归

### 8.1 语法与模块

```bash
node --check js/data.js
node --check js/campuses.js
node --check js/site.js
# 新校区文件同理
node --check js/campuses/<id>/site.js && node --check js/campuses/<id>/data.js
```

### 8.2 数据自检（临时脚本放 `/tmp`，不提交）

```js
// /tmp/check-campuses.mjs
import assert from 'node:assert/strict';
const ROOT = '/path/to/hainan-middle-school-atlas';
const {
  CAMPUSES, CAMPUS_LIST, DEFAULT_CAMPUS_ID,
  getCampus, resolveCampus, validateCampus, validateRegistry,
  parseCampusParam, buildCampusSearch
} = await import(`${ROOT}/js/campuses.js`);

// 1) 整表通过
assert.equal(validateRegistry().ok, true, JSON.stringify(validateRegistry().errors));

// 2) 默认校区完整
const fucheng = getCampus(DEFAULT_CAMPUS_ID);
assert.equal(fucheng.status, 'active');
assert.ok(fucheng.site && fucheng.landmarks.length > 0);
assert.equal(fucheng.site, (await import(`${ROOT}/js/site.js`)).SITE);

// 3) 未知 id 回退
assert.equal(getCampus('no-such-campus'), fucheng);
assert.equal(resolveCampus('no-such-campus').reason, 'unknown');
assert.equal(resolveCampus('no-such-campus').campus, fucheng);

// 4) planned 不渲染
assert.equal(resolveCampus('meilun').reason, 'planned');
assert.equal(resolveCampus('meilun').fallback, true);

// 5) URL 规范化
assert.equal(parseCampusParam('?campus=fucheng').reason, 'ok');
assert.equal(parseCampusParam('?campus=xyz').reason, 'unknown');
assert.equal(buildCampusSearch('fucheng', '?campus=meilun&spot=gate'), '?spot=gate');

// 6) 每个校区逐个校验
for (const campus of Object.values(CAMPUSES)) {
  const report = validateCampus(campus);
  assert.equal(report.ok, true, `${campus.id}: ${report.errors.join('; ')}`);
}
console.log('campus registry OK');
```

### 8.3 页面回归（人工 / 自动化截图）

- 打开开发版 `index.html`（需要 HTTP 服务，如 `./serve.sh`）：无 console error；场景正常；
- 桌面 + 手机（≤ 900px）各跑一遍 §4 Step 9 清单；
- URL 参数组合：`?campus=fucheng`、`?campus=xyz`、`?spot=gate`、`?view=top`、`?hour=19.6`、`?nointro`；
- 构建后 `hainan-middle-school.html` 直接双击（file://）验证；
- 性能：DevTools Performance / `renderer.info`（draw calls、triangles）对照 §6.2 预算；
- 内存：切换校区 3 次后 `renderer.info.memory` 不随次数增长。

### 8.4 浏览器控制台自检

`js/campuses.js` 载入时会静默运行 `validateRegistry()`；注册表有问题会在控制台输出 `[campuses] 校区注册表校验未通过…`（不影响页面继续运行）。集成后也可在控制台手动调用 `validateCampus()` 排查。

---

## 9. FAQ

**Q：新增校区一定要改 `js/data.js` 吗？**
A：不用。建议新校区独立 `js/campuses/<id>/data.js`；`js/data.js` 只保留府城的内容层（它同时是历史兼容层）。注册表按校区 import 各自的 data/site。

**Q：为什么 `getCampus('meilun')` 返回 planned 条目，但页面不会渲染美伦？**
A：`getCampus()` 是**注册表查询**（用于列表 / 元数据展示）；渲染路由用 `resolveCampus()`，它只返回 active 校区并把 planned 视为回退（`reason: 'planned'`）。main.js 应使用 `resolveCampus()` / `parseCampusParam()`。

**Q：为什么默认校区的 URL 不带 `?campus=`？**
A：规范 URL 原则：默认值不写入 URL，分享链接更短、旧链接兼容。`buildCampusSearch()` 已处理。

**Q：新增校区可以用自己的 `theme` 换肤吗？**
A：可以。`theme` 前 8 个键与 `css/style.css` 的 CSS 变量同名；接入时在切换校区时把这些值写回 `:root` / `document.documentElement.style.setProperty()`。注意夜间模式（`body[data-night='true']`）有独立色值，需要一并处理或保持夜间色不变。

**Q：校区 id 和地标 id 会冲突吗？**
A：不会。`?campus=` 先解析校区，`?spot=` 只在解析后的校区内查找；不同校区可以使用相同的地标 id（如 `gate`）。若未来做全局搜索 / 分享卡，建议给地标 id 加校区前缀。

**Q：可以不做 3D 场景、只做 2D 总平面吗？**
A：可以，但需要场景构建器返回满足 `SceneApi` 的对象（哪怕场景只有地面 + 2D 平面）。`features.walk / weather / tour` 可设为 `false` 以隐藏对应 UI；`minimap` 仍可用。

**Q：为什么文档里的 main.js 行号和我看到的不一样？**
A：`index.html` / `main.js` 正由布局协作者重写，行号会漂移。本文行号基于提交 `db61dd8`，定位请以**函数名 / 常量名**为准。

---

## 附录 A. 字段速查表

| 层级 | 文件 | 必须存在 | 说明 |
| --- | --- | --- | --- |
| 内容 | `CAMPUS_META` | `id / status / school / name / en / address / overview / top` | 校区身份 |
| 内容 | `LANDMARKS[]` | `id / index / name / anchor / camera / map / diagram / description` | 叙事地标 |
| 内容 | `TOUR_ORDER[]` | 是 `LANDMARKS[].id` 子集 | 导览顺序 |
| 内容 | `SOURCES[]` | `{ label, url }` | 文献与署名 |
| 内容 | `theme` | `paper / ink / muted / accent`（建议） | 主题色 |
| 内容 | `features` | 5 个布尔位 | 能力开关 |
| 空间 | `SITE` | `scale / center / bounds / campusOutline / buildings / track / courts / roads / gates / northGate / southGate / attribution` | 平面数据 |
| 场景 | `SceneApi` | 见 §2.6 | 构建器返回 |
| 注册 | `defineCampus({...}, { validate: true })` | `id / status / name / school` + active 全套 | 注册条目 |

## 附录 B. 新增校区 PR 检查清单

- [ ] 新校区数据单独成文件（`js/campuses/<id>/…`），未污染 `js/data.js` / `js/site.js`；
- [ ] 坐标符合「1 单位 ≈ 2 m、x 东、z 南、北 -z」，且用同一脚本换算；
- [ ] `SITE.attribution` / `campus.license` 含 ODbL 署名与抓取日期；
- [ ] `defineCampus(..., { validate: true })` 通过；
- [ ] `node --check` 全部通过；临时校验脚本通过；
- [ ] `resolveSceneBuilder()` 能解析到构建器（`SCENE_BUILDERS` 已注册）；
- [ ] `?campus=<id>` 正常，未知 / planned 回退与 toast 正确，URL 规范化正确；
- [ ] 切换校区不残留 THREE 资源（`dispose()` 实现并验证）；
- [ ] `index.html` 品牌文案 / `document.title` / meta description 按校区更新；
- [ ] 手机端与桌面端验收通过；性能在 §6.2 预算内；
- [ ] `node build.mjs` 成功，产物 `file://` 可打开（构建由项目负责人统一执行）；
- [ ] 未提交临时脚本 / 未手改 `hainan-middle-school.html`。

---

*本指南与 `js/campuses.js`、`js/data.js`、`docs/campuses.md` 同批引入。若实现与文档不一致，以代码与 `validateCampus()` 的报错为准，并回头更新本文件。*
