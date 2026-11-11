# 参与开发 · 府城校园图志

面向后续维护者、建模与前端协作者，以及在此仓库上工作的 AI agent。新增校区的完整流程见 [campuses.md](campuses.md)；模型与建筑处理见 [design-notes.md](design-notes.md)；精度声明见 [accuracy.md](accuracy.md)。

---

## 环境

- Node.js（建议 20+），用于 `npm run build` / `npm run serve` / `npm run shots`。
- 本机 Chrome 或 Chromium（视觉回归通过 `playwright-core` 驱动；可用 `CHROME_PATH` 指定路径）。
- 运行页面本身不需要构建：单文件版双击即可；开发版需要本地 HTTP 服务。

```bash
npm install          # 安装 rollup / playwright-core / pngjs
npm run serve        # python3 -m http.server 8080
```

打开 <http://127.0.0.1:8080/>（开发入口 `index.html`，ES Modules + import map，必须走 HTTP）。

## 数据分层

改动前先确认自己动的是哪一层：

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 内容层 | `js/data.js` | 校区身份、地景索引与叙事文本、导览顺序、文献来源、取景参数。不 import Three.js |
| 空间层 | `js/site.js` | 由 OSM 轮廓简化整理出的建筑、道路、运动场、球场与出入口坐标（2026-10 抓取；非原始几何） |
| 注册层 | `js/campuses.js` | 校区注册表、`?campus=` 解析与回退、`validateCampus` 数据校验 |
| 场景层 | `js/campus-accurate.js` | 接受 `{campus, site, landmarks, theme}` 搭建三维场景，提供 `dispose()` |
| 页面层 | `js/main.js`、`index.html`、`css/style.css` | 相机、UI、交互、昼夜与导览 |

约束：内容层与空间层不得反向依赖场景层；新增校区时把数据放进对应层，不要往 `main.js` 或 `campus-accurate.js` 里塞校区特判（详见 [campuses.md](campuses.md)）。

## 构建与单文件产物

```bash
npm run build        # node build.mjs → hainan-middle-school.html
```

- `build.mjs` 用 Rollup 把 `js/main.js` 打成 IIFE，内联本地 WOFF2 字体与 CSS，输出**完全自包含**的单文件版（当前约 1.9 MB），可直接 `file://` 打开、无需联网。
- **不要手改 `hainan-middle-school.html`**：它是产物，会被下一次构建覆盖。改源码后重新 build。
- 单文件版是发布与分享的主入口；开发入口 `index.html` 加载的仍是源码模块，二者行为应一致。
- 构建产物体积是显式预算：新增依赖、贴图或字体前先确认必要性，避免把单文件版推向数 MB。

## 视觉回归

```bash
npm run shots            # 按固定机位截图并与基准逐像素比较，有差异则退出码 1
npm run shots:update     # 确认改动符合预期后重建基准
node tools/shot.mjs --only=gate --threshold=0.001
```

- 机位清单在 `tools/shots.mjs`（总览/金色时刻/夜景/校门/凤栖堂/图书馆/暴雨/雪/移动端），截图由 `tools/shot.mjs` 生成，差异对比在 `tools/imagediff.mjs`。
- 基准与输出目录（`tools/shots/{baseline,current,diff}/`）已被 `.gitignore` 忽略，需本地重建。
- 截图使用 `?still=1&nointro=1` 冻结时钟与随机种子，直接测开发入口 `index.html`（因此**改完 js 不必先 build 就能跑门控**；build 只负责更新单文件产物）。新增机位时沿用这一约定。
- 原理、阈值、加机位方法与局限见 [visual-regression.md](visual-regression.md)。
- **只改 `README.md` / `docs/` 时不需要跑视觉回归**；改 `js/`、`css/`、`index.html` 或任何影响画面的内容后必须跑。

## 建模约定

- 场景单位：**1 场景单位 ≈ 2 米**（固定比例，不等于测绘精度）；坐标 `x = 东`、`z = 南`、`北 = -z`。
- 重点建筑位于 `js/landmarks/`，模块内部**一律使用米**（与照片、资料一致），建筑局部 `+z` 为正面。
- `build(ctx)` 返回 `THREE.Group`，末尾用 `finalize()` 换算到场景单位、按材质合并静态网格、统一开启阴影。
- 共享中式构件（曲面瓦顶、双坡顶、窗、石狮、栏杆、浮雕带等）集中在 `js/landmarks/parts.js`，不要在单体里复制。
- 集成由 `js/campus-accurate.js` 按 OSM 中心点与长边角放置，并注册拾取与地标。
- 单独预览一栋建筑（比加载整个校园快得多）：

```text
http://127.0.0.1:8080/tools/model-preview.html?model=gate&view=front
model = gate | teaching | fengqi | yanlin
view  = front | persp | aerial | side | back
```

- 性能：优先合并网格、复用材质、限制阴影投射体；避免在每帧里新建几何体或材质。

## 渲染耦合系统：串行单 owner

以下系统被大量对象共享，**同一时间只允许一个 owner 改动**，改完立即构建并截图验证，避免多人并行产生不可归因的视觉回归：

- 色调映射 / 曝光 / 后处理参数；
- 天空与雾；
- 太阳角度与全部光照、阴影参数；
- PMREM 环境贴图（`?env=off` 可做 A/B）。

需要与他人并行时，把改动拆成「先数据/几何、后渲染」两段，渲染段排队。

## 文档约定

- `README.md` 是**展示型入口**：图集、快速开始、工作流、精度、文档索引；篇幅控制在 ~150 行内。
- 长内容进 `docs/`：功能与建筑细节 → [design-notes.md](design-notes.md)；时间线 → [changelog.md](changelog.md)；参与开发 → 本文件。
- 任何行为变化都应追加一条 `changelog.md` 记录；精度/证据类结论变更同步 [accuracy.md](accuracy.md)。
- 图片引用使用仓库内相对路径（`assets/preview/*.jpg`）；不新增未经许可的第三方素材。

## Agent 协作约定

本仓库多次由多个 agent 并行改动，约定如下：

1. **先读后写**：动手前读 `README.md`、`docs/`、相关源码与最近 `git log`，不要凭猜测改。
2. **显式 write scope**：每个任务只改约定的文件；跨层改动（尤其是渲染系统）先与 lead 确认 owner。
3. **构建与截图串行**：`npm run build`、`npm run shots` 会写产物/基准目录，同一时间只允许一个 agent 执行。
4. **不 commit / push**：除非任务明确要求；不要 `git reset --hard`、不要删 assets。
5. **收尾自检**：改代码后跑 `npm run build` + `npm run shots`；只改文档则检查链接与措辞是否与实现、与 [accuracy.md](accuracy.md) 一致。
6. **报告口径**：完成时报告「改了哪些文件、验证方式、遗留项」，避免只写「已完成」。

## 提交前清单

- [ ] 改动可归因：一次提交只做一件事，diff 不含无关格式化。
- [ ] `npm run build` 成功，单文件版可双击打开。
- [ ] 影响画面 → `npm run shots` 无意外差异（或已 `shots:update` 并说明原因）。
- [ ] 新增/修改的文字没有夸大「真实/复原」的确定性，边界项已写入 [accuracy.md](accuracy.md)。
- [ ] `docs/changelog.md` 已有对应记录；相关文档链接有效。
