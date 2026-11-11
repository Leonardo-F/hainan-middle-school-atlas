# 目录结构 · 府城校园图志

> README 只保留速览；这里是完整清单。各层职责与改动约束见 [contributing.md](contributing.md)，新增校区见 [campuses.md](campuses.md)。

```text
index.html                 开发入口：页面结构、图志内容容器、ES Modules + import map
hainan-middle-school.html  完全自包含单文件版（构建产物，可直接双击打开）
css/style.css              版式、响应式与主题
build.mjs                  单文件版构建脚本（Rollup 打包 + 内联字体/CSS）

js/main.js                 相机、UI、交互、昼夜、导览与视觉回归单帧模式
js/site.js                 空间层：由 OSM 轮廓整理的建筑、道路、运动场、球场与出入口坐标
js/data.js                 内容层：校区身份、地景索引、叙事文本、导览顺序与取景参数
js/campuses.js             校区注册表、?campus= 解析/回退与数据校验
js/campus-accurate.js      场景构建器：接受 {campus, site, landmarks, theme}，提供 dispose()
js/campus.js               可复用材质、植被、建筑构件与程序化细节贴图
js/textures.js             程序化贴图、立面绘制、法线/粗糙度细节生成
js/interiors.js            低模室内场景与室内机位
js/weather.js              六种天气、粒子与天气联动
js/film.js                 自动巡游影片脚本与 WebM 录制
js/landmarks/parts.js      四座重点建筑共享的中式构件库
js/landmarks/gate.js       校门（米制）
js/landmarks/teaching.js   主教学楼（米制）
js/landmarks/fengqi.js     凤栖堂（米制）
js/landmarks/yanlin.js     衍林堂（米制）
js/landmarks/library.js    图书馆（米制；位置为编辑推测）

tools/model-preview.html   单栋建筑快速预览器（开发工具，不参与构建）
tools/preview-scene.js     预览器场景装配
tools/scene-check.html     场景几何自检页
tools/scene-check.js       超大网格检查（不覆盖间距/轮廓校验）
tools/shot.mjs             视觉回归：截图、比较与基准更新
tools/shots.mjs            固定机位清单
tools/imagediff.mjs        逐像素对比与 diff 图

vendor/                    Three.js r169 与 OrbitControls（本地依赖）
assets/fonts/              拉丁 UI 字体（SIL OFL 1.1）
assets/preview/            预览图与巡游样片（构建产物，随 MIT 分发）

docs/changelog.md          按日期的变更记录与 2026-11 修正证据表
docs/design-notes.md       建筑处理、系统设计与已知写意项
docs/features.md           功能与实现说明
docs/accuracy.md           精度审计：逐条证据、边界与建议措辞
docs/contributing.md       开发工作流、构建、视觉回归、建模与 agent 协作约定
docs/structure.md          本文件：完整目录结构
docs/campuses.md           多校区扩展与新增校区指南
docs/visual-regression.md  视觉回归原理、用法、机位与阈值
docs/ai-generated-3d-games.md     AI 一次生成 3D 网页游戏的拆解与借鉴
docs/ai-video-reconstruction.md   视频/照片还原建筑模型的调研

README.md                  展示型首页：效果图、快速开始、文档入口与许可证

package.json               脚本：serve / build / shots / shots:update
LICENSE                    MIT（代码与页面）；OSM 数据 ODbL、字体 OFL
.gitignore                 忽略 node_modules 与视觉回归基准/输出
```

## 生成物与不入库内容

- `hainan-middle-school.html` 由 `npm run build` 生成，**不要手改**。
- `node_modules/`、`tools/shots/{baseline,current,diff}/` 不入库（视觉回归基准按机器本地生成）。
- `assets/preview/` 是公开预览图/样片，入库。
