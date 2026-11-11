# 府城校园图志 · 海南中学

基于 Three.js 的海南中学府城校区（高中部）交互三维校园图志：把一座校园，读成一张可以行走的图。以建筑为线索，在体量与光影之间，重访府城校区的日常。

**在线访问**：<https://leonardo-f.github.io/hainan-middle-school-atlas/> · **单文件版**：`hainan-middle-school.html`（双击即开）

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

**巡游影片**：约 85 秒电影式巡游，含室内穿行、遮幅、中英字幕与进度条；点击页面底部「影片」播放。

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

另有 `?film=1`（直接播放巡游影片）、`?weather=snow`（指定天气）、`?still=1&nointro=1`（视觉回归固定帧）等开发参数。

## 文档与开发

- **功能与实现**：[docs/features.md](docs/features.md) — 漫游、图志、昼夜天气、影片、程序化渲染与响应式。
- **开发工作流**：[docs/contributing.md](docs/contributing.md) — 构建、视觉回归、建模约定、Agent 协作与提交前清单。
- **目录结构**：[docs/structure.md](docs/structure.md)；**精度与证据**：[docs/accuracy.md](docs/accuracy.md)。
- **设计注记**：[docs/design-notes.md](docs/design-notes.md)；**变更记录**：[docs/changelog.md](docs/changelog.md)。
- **视觉回归原理**：[docs/visual-regression.md](docs/visual-regression.md)；**多校区扩展**：[docs/campuses.md](docs/campuses.md)。
- **AI 相关调研**：[AI 一次生成 3D 网页游戏](docs/ai-generated-3d-games.md) · [视频还原建筑模型](docs/ai-video-reconstruction.md)。

目录速览：

```text
hainan-middle-school.html  自包含单文件版（构建产物，双击即开）
index.html                 开发入口（ES Modules + import map）
js/                        main · site · data · campuses · campus-accurate · campus · textures · interiors · weather · film · landmarks
css/style.css              版式、响应式与主题
tools/                     单栋预览、视觉回归截图与对比
docs/                      功能、精度、工作流、结构、调研文档
assets/                    字体（SIL OFL）与预览图（另有巡游样片）
build.mjs                  单文件版构建脚本
```

常用命令：

```bash
npm install
npm run serve      # 开发服务器 http://127.0.0.1:8080/
npm run build      # 重新生成自包含单文件版
npm run shots      # 视觉回归门控（shots:update 重建基准）
```

发布：GitHub Pages 直接服务 `main` 分支根目录（`index.html` + `.nojekyll`），无需额外构建；单文件版随仓库分发。

## 许可证

- **代码与页面**（`js/`、`css/`、`index.html`、`build.mjs`、`tools/`、单文件构建产物）：[MIT](LICENSE)，Copyright © 2026 Gaoming Fan（范高铭）。
- **校园空间数据**（`js/site.js` 等由 OSM 整理的轮廓与坐标）：来自 [OpenStreetMap](https://www.openstreetmap.org/way/1127981105)，© OpenStreetMap contributors，按 [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) 使用；衍生空间数据对外分发需遵守 ODbL 共享条款。
- **字体**（`assets/fonts/`）：Bodoni Moda、DM Mono、Instrument Sans，按 [SIL Open Font License 1.1](https://openfontlicense.org/) 分发。**预览图与样片**（`assets/preview/`）为本项目渲染输出，随 MIT 分发。
- 校名、「海中」等学校标识权利归学校所有，不因本许可证转移。
