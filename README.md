# 府城校园图志 · 海南中学

基于 Three.js 的海南中学府城校区（高中部）交互三维校园图志：把一座校园，读成一张可以行走的图。以建筑为线索，在体量与光影之间，重访府城校区的日常。

[在线访问](https://leonardo-f.github.io/hainan-middle-school-atlas/) · 单文件版 `hainan-middle-school.html`（双击即开） · [文档索引](#文档索引)

![府城校园图志总览](assets/preview/overview.jpg)

> **精度说明**：校园总平面参考 OpenStreetMap 轮廓与公开影像整理；校门、主教学楼、凤栖堂、衍林堂四座重点建筑依据公开照片与官方资料按形制与米制尺度复原，但仍是写意模型、不保证与实物逐处一致；其余建筑的体量与立面为设计推演。固定 1 场景单位 = 2 米是场景比例，不等于测绘精度。模型不是测绘成果，不用于导航、测量或校园空间决策；图书馆位置为推测、部分体量为近似、南门无实拍等边界见 [docs/accuracy.md](docs/accuracy.md)。
>
> 本页面为非官方数字文化项目，与海南中学无隶属关系。府城校区含高中部与初中部，本图志**仅绘制高中部**。

## 图集

| 校门 | 主教学楼 |
| --- | --- |
| ![校门](assets/preview/north-gate.jpg) | ![主教学楼](assets/preview/teaching-hall.jpg) |
| **凤栖堂** | **衍林堂** |
| ![凤栖堂](assets/preview/fengqi-hall.jpg) | ![衍林堂](assets/preview/yanlin-hall.jpg) |
| **图书馆** | **体育馆（平屋面）** |
| ![图书馆](assets/preview/library.jpg) | ![体育馆](assets/preview/gym.jpg) |
| **操场主席台与看台** | **主教学楼教室（室内）** |
| ![主席台与看台](assets/preview/stand.jpg) | ![主教学楼教室](assets/preview/interior-mainhall.jpg) |
| **图书馆阅览室（室内）** | **凤栖堂厅堂（室内）** |
| ![图书馆阅览室](assets/preview/interior-library.jpg) | ![凤栖堂厅堂](assets/preview/interior-fengqi.jpg) |
| **夜景** | **下雪** |
| ![夜景](assets/preview/night.jpg) | ![下雪](assets/preview/snow.jpg) |

**巡游影片**：约 85 秒的电影式巡游，含室内穿行、遮幅、中英字幕与进度条；点击页面底部「影片」播放。

[![巡游影片截图](assets/preview/film.jpg)](assets/preview/campus-tour.mp4)

▶ 85 秒样片：[assets/preview/campus-tour.mp4](assets/preview/campus-tour.mp4)（1152×826，H.264，纯 3D 画面）。

## 快速开始

### 直接打开（推荐）

双击 `hainan-middle-school.html`。这是完全自包含的单文件版本（约 1.9 MB）：Three.js、字体、样式与程序化贴图全部内联，无需联网，也无需本地服务器。

### 开发版

```bash
npm install
npm run serve        # python3 -m http.server 8080
```

然后访问 <http://127.0.0.1:8080/>。开发入口 `index.html` 使用 ES Modules 与 import map，必须通过本地 HTTP 服务访问；直接打开请用单文件版。

### URL 参数

| 参数 | 说明 |
| --- | --- |
| `?campus=fucheng` | 指定校区（默认即府城；未注册校区会回退并提示） |
| `?spot=fengqi` | 加载后直接打开凤栖堂图志 |
| `?hour=19.6` | 以指定日照时刻开始（06:00–20:48） |
| `?view=top` | 以俯瞰视角开始 |

另有 `?film=1`（直接播放巡游影片）、`?weather=snow`（指定天气）、`?still=1&nointro=1`（视觉回归用固定帧）等开发参数。

## 功能一览

- **自由漫游**：拖动旋转、滚轮缩放、右键平移；点击建筑、编号或索引即飞向对应图志。
- **地景索引与图志**：20 处地景统一收录，含立面示意、沿革与观察要点；配小地图、三维编号与自动导览。
- **昼夜与天气**：日照滑杆 06:00–20:48 连续调整太阳、天空、窗光与路灯；晴 / 小雨 / 暴雨 / 台风 / 雷雨 / 下雪为程序化效果并与时刻联动。
- **自动巡游影片**：约 85 秒、30 段的电影式巡游，可录制下载 WebM，`?film=1&record=1` 可无人值守出片。
- **重点建筑复原**：校门、主教学楼、凤栖堂、衍林堂独立米制模块；学生、校服与三处低模室内用于氛围与尺度表达。
- **程序化与自包含**：屋瓦、铺地、立面、匾额、跑道均由 Canvas 生成，无外部贴图依赖；运行时无第三方网络请求。
- **响应式**：桌面端环景式图志界面；手机端横向地标条、编号地标与底部抽屉，并自动重新取景。

## 目录结构

```text
index.html                 开发入口：页面结构与图志内容容器（ES Modules）
hainan-middle-school.html  完全自包含单文件版（构建产物，可直接双击打开）
css/style.css              版式、响应式与主题
js/main.js                 相机、UI、交互、昼夜与导览
js/site.js                 府城空间层：OSM 整理的建筑轮廓、道路、运动场与出入口
js/data.js                 府城内容层：校区身份、地景索引、叙事文本与取景参数
js/campuses.js             校区注册表、?campus= 契约与数据校验
js/campus-accurate.js      三维场景构建器（接受 {campus, site, landmarks, theme}，含 dispose）
js/campus.js               可复用的材质、植被与建筑构件函数
js/textures.js             程序化贴图与立面绘制
js/interiors.js            低模室内场景
js/weather.js              天气与粒子效果
js/film.js                 自动巡游影片脚本与录制
js/landmarks/parts.js      四座重点建筑共享的中式构件库
js/landmarks/*.js          校门 / 主教学楼 / 凤栖堂 / 衍林堂 / 图书馆 独立模型（米制）
tools/model-preview.html   单栋建筑预览器（开发工具，不参与正式构建）
tools/shot.mjs             视觉回归：截图、对比与基准更新
tools/shots.mjs            固定机位清单
build.mjs                  单文件版构建脚本
vendor/                    Three.js 与 OrbitControls
assets/fonts/              字体（SIL OFL）
assets/preview/            预览图与巡游样片
docs/                      长文档（见文末索引）
```

## 参与与工作流

```bash
npm install
npm run serve        # 开发服务器 http://127.0.0.1:8080/
npm run build        # 生成自包含单文件 hainan-middle-school.html（勿手改产物）
npm run shots        # 视觉回归：按固定机位逐像素对比基准（shots:update 重建基准）
```

- **单栋建筑预览**（开发时比加载整个校园快得多）：<http://127.0.0.1:8080/tools/model-preview.html?model=gate&view=front>，`model = gate | teaching | fengqi | yanlin`，`view = front | persp | aerial | side | back`。
- **改动影响画面后**：跑 `npm run build` 更新单文件产物、`npm run shots` 做视觉门控（截图直接测开发入口 `index.html`，无需先 build）；只改文档不需要。
- **视觉回归原理、阈值与新增机位**见 [docs/visual-regression.md](docs/visual-regression.md)；完整开发约定见 [docs/contributing.md](docs/contributing.md)。

## Agent 行动指南

- **数据层与场景层分离**：`js/data.js`（内容）、`js/site.js`（空间）、`js/campuses.js`（注册）不依赖场景层；场景由 `js/campus-accurate.js` 组装。新增校区按 [docs/campuses.md](docs/campuses.md) 走。
- **建模约定**：`js/landmarks/*` 内部用**米**（建筑局部 `+z` 为正面），`build()` 末尾用 `finalize()` 换算到场景单位（1 场景单位 ≈ 2 米）、按材质合并网格；共享构件放 `parts.js`。
- **渲染耦合系统串行单 owner**：色调映射 / 天空 / 光照 / PMREM 环境贴图被大量对象共享，同一时间只允许一个 owner 改动，改完立即 `npm run build` + `npm run shots`。
- **收尾自检**：改代码后 `npm run build` 更新单文件产物、`npm run shots` 做视觉门控；改文档核对链接与精度措辞。不要提交未经要求的 commit。

## 精度与证据

模型不追求测绘级准确性：总平面依据 OSM 轮廓与公开影像整理，四座重点建筑依据公开照片与官方资料复原形制与尺度（写意，非测绘），其余立面、屋顶、植被、人物与室内为设计推演。逐条「真实性」主张的判定（可核查 / 有依据 / 推测 / 已证伪）、建议措辞与仍需资料确认的清单见 **[docs/accuracy.md](docs/accuracy.md)**；2026-11 修正的依据与置信度表见 [docs/changelog.md](docs/changelog.md#2026-11-修正与证据迁移自-readme)。

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [docs/changelog.md](docs/changelog.md) | 按日期的变更记录、2026-11 修正与证据表 |
| [docs/design-notes.md](docs/design-notes.md) | 建筑处理、系统设计与已知写意项（原 README「项目特征」） |
| [docs/accuracy.md](docs/accuracy.md) | 精度审计：逐条证据、边界与建议措辞 |
| [docs/contributing.md](docs/contributing.md) | 开发工作流、构建、视觉回归、建模与 agent 协作约定 |
| [docs/campuses.md](docs/campuses.md) | 多校区扩展与新增校区指南 |
| [docs/visual-regression.md](docs/visual-regression.md) | 视觉回归：原理、用法、机位与阈值 |
| [docs/ai-generated-3d-games.md](docs/ai-generated-3d-games.md) | AI 一次生成可玩 3D 网页游戏的拆解与借鉴 |
| [docs/ai-video-reconstruction.md](docs/ai-video-reconstruction.md) | 视频还原建筑模型（3DGS / 结构化重建）调研 |

## 许可证

- **代码与页面**（`js/`、`css/`、`index.html`、`build.mjs`、`tools/`、单文件构建产物）：[MIT](LICENSE)，Copyright © 2026 Gaoming Fan（范高铭）。
- **校园空间数据**（`js/site.js` 等由 OSM 整理的轮廓与坐标）：来自 [OpenStreetMap](https://www.openstreetmap.org/way/1127981105)，© OpenStreetMap contributors，按 [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) 使用；三维重建与场景坐标转换为衍生内容，对外分发衍生空间数据时需遵守 ODbL 共享条款。
- **字体**（`assets/fonts/`）：Bodoni Moda、DM Mono、Instrument Sans，按 [SIL Open Font License 1.1](https://openfontlicense.org/) 分发。
- **预览图与样片**（`assets/preview/`）：本项目渲染输出，随代码以 MIT 分发（不含上述第三方数据与字体）。
- 校名、「海中」等学校标识权利归学校所有，不因本许可证转移。
