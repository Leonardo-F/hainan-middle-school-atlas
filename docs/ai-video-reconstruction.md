# 视频还原建筑模型（可交互）调研

> 调研时间：2026-11-09。这里整理“用视频/照片还原建筑并做交互”的现状、可用模型与产品，以及接入本图志的可行路线。
> 本文只是调研记录，不是本项目的功能承诺；当前图志仍以手工建模 + OSM 轮廓为主。

## 结论

- 已经有很多系统能从视频还原**照片级三维场景**（3D Gaussian Splatting / 网格），可第一人称漫游、可点选热点。
- 也有模型能把视频/点云转成**结构化室内模型**（墙、门、窗、房间、家具框），这是最接近“建筑模型”的一类。
- 但**没有系统能做到“一段视频一键输出精确、可编辑、带 BIM 语义的建筑模型”**。工程上通常是：
  **视频 → 3DGS/点云 → 结构化提取 → 人工规则化/修模 → 引擎交互**。
- “可交互”也分层次：观感漫游（3DGS）、语义交互（房间/构件）、可编辑 BIM（需要人工修模或激光扫描），不能混为一谈。

## 路线 A：视频 → 3DGS / 网格（实景还原，可交互漫游）

| 模型/系统 | 能力 | 链接 |
|---|---|---|
| VGGT（CVPR 2025） | 从视频/多视图秒级预测相机、深度、点云，常用来替代 COLMAP | [论文](https://openaccess.thecvf.com/content/CVPR2025/html/Wang_VGGT_Visual_Geometry_Grounded_Transformer_CVPR_2025_paper.html) / [代码](https://github.com/facebookresearch/vggt) |
| LongSplat（ICCV 2025，NVIDIA） | 长视频 → 单场景一致的 3DGS，减少闪烁 | [GitHub](https://github.com/nvlabs/LongSplat) |
| DepthSplat（CVPR 2025） | 多视深度约束的 3DGS | [GitHub](https://github.com/autonomousvision/depthsplat) |
| SHARP（Apple） | 单张图 → 3DGS，补拍不到的角度 | 非商用授权 |
| TripoSplat | 单图 → 3DGS，MIT 许可，可商用 | 见 Splatline 后端说明 |
| Splatline（MIT 工程管线） | 视频/照片 → 交互 3DGS，内置 VGGT / DepthSplat / LongSplat / SHARP / TripoSplat 五种后端，可导出给 SuperSplat 查看 | [GitHub](https://github.com/jaskirat1616/Splatline) |

商业产品：Polycam（视频/照片 → 摄影测量或 3DGS，[入口](https://poly.cam/tools/gaussian-splatting)、[教程](https://learn.poly.cam/hc/en-us/articles/30549121659412-How-to-Create-Photogrammetry-and-Gaussian-splats-from-Existing-Images-and-Videos)）、Luma AI、如视 Realsee（[官网](https://www.realsee.ai/)）、Matterport、Solaya（iPhone 视频 → 照片级数字孪生，[PlayCanvas 案例](https://blog.playcanvas.com/from-iphone-video-to-photorealistic-3d-digital-twin-developer-spotlight-on-solaya)）。

查看/编辑：

- **Spark**：World Labs 的 Three.js 3DGS 渲染器，可加载 ply / sogs / spz，适合接进现有 Three.js 场景（[官网](https://sparkjs.dev/)）。
- **SuperSplat**：PlayCanvas 的 MIT 开源编辑器，支持步行模式、XR、网页发布、相机飞览（[编辑器](https://superspl.at/editor) / [GitHub](https://github.com/playcanvas/supersplat)）。

限制：没有墙体/房间/构件语义；玻璃、反光、纯白墙、天空容易失败；单目视频有尺度漂移；单栋资产常见 30–60 MB，移动端需要压缩（SOG 等）。

## 路线 B：视频/点云 → 结构化建筑（墙/门/窗/房间/家具）

- **SpatialLM**（NeurIPS 2025，群核科技开源）：点云 → 墙、门、窗、房间布局 + 家具 3D 框；支持单目视频经 MASt3R-SLAM / SLAM3R 得到点云直接推理。Structured3D 布局 F1 约 94.3@0.25 IoU，权重、数据、评测代码均公开。[GitHub](https://github.com/manycore-research/SpatialLM) / [论文](https://arxiv.org/abs/2506.07491)
- 布局估计基线：Meta SceneScript、RoomFormer（SpatialLM 论文中有对比）。
- 建筑/城市方向：Sharpsplat（边缘正则化 3DGS 做城市建筑重建，[IEEE 2026](https://ieeexplore.ieee.org/document/11731299)）、带建筑语义的无人机 GS 重建（[IEEE](https://ieeexplore.ieee.org/document/11637718)）。
- **Scan-to-BIM（点云 → BIM）**：仍以半自动为主（2026 综述：[From Indoor Point Clouds to BIM](https://ieeexplore.ieee.org/document/11584150)）；商业侧有 Leica Cyclone、Autodesk ReCap、Verity、Cintoo 360（把 360 视频/照片接入 3D/BIM 工作流，[Geo Week](https://www.geoweeknews.com/articles/cintoo-launches-360-edition-bringing-ricoh-native-360-data-into-3d-workflows/)）；OpenSpace / Buildots 属于施工进度比对，不是自动重建。

限制：主要是室内、单层、单栋；构件/材料/机电/层高需要人工补；单目视频尺度需要已知门宽/层高校准；不能直接用于报建。

## 路线 C：视频 → 交互式世界模型（体验/预演）

- **World Labs Marble / World API**：支持文本、图片、全景、多视图、**视频**生成可探索 3D 世界，可导出 Gaussian Splat / Mesh，可嵌入网页或引擎；有建筑/设计行业用例。[World API 公告](https://www.worldlabs.ai/blog/announcing-the-world-api) / [Marble 文档](https://docs.worldlabs.ai/)
- **Google DeepMind Genie 4 / Project Genie**：Genie 4（2026-10 研究发布）按用户操作实时生成可交互世界，并同时生成画面/音乐/对话（[官方页](https://deepmind.google/models/genie/)、[Genie 3 介绍](https://deepmind.google/blog/genie-3-a-new-frontier-for-world-models/)）；Project Genie 2026-05 起接入 Street View 真实地点，可把真实地点变成可探索世界（Google AI Ultra 订阅，[报道](https://www.digit.in/news/general/google-project-genie-can-now-turn-real-locations-into-interactive-ai-worlds-here-is-how.html/amp/)）。
- **World Labs Atlas / Frameboy**（2026-11）：自回归世界模型，云端流式输出，实时 15fps 相机控制探索（[公告](https://www.worldlabs.ai/blog/atlas-realtime)）。
- **高德 ABot-World / ABot-3DWorld**（2026-07）：交互视频 + 3DGS 场景生成，单张消费级 GPU 连续运行 1 小时以上，支持“空间传送”串联多个世界，部分开源（[报道](https://www.manilatimes.net/2026/07/16/tmt-newswire/pr-newswire/alibabas-amap-unveils-abot-world-ai-models-that-generate-interactive-video-and-3d-scenes-for-hours-on-a-single-gpu/2385639/amp) / [体验入口](https://abot-world.amap.com/)）。

限制：观感好、可探索，但几何与尺度不精确，不能当测绘/BIM；适合宣传片、教学体验、影视预演。

## 接入本图志的建议

**方案 A：实景层（最快，单栋 1–2 天）**

1. 无人机环绕校园 + 手机 4K 60fps 绕建筑内外拍（缓慢平移，覆盖门窗与墙角，避免纯白墙/玻璃/天空占满画面）。
2. 用 Polycam / 如视 / Splatline（VGGT + LongSplat）出 3DGS，导出 PLY/SOG。
3. 用 **Spark** 把 3DGS 作为独立图层叠加到现有 Three.js 图志，做“实景 / 体块”切换；必要时用 SuperSplat 压缩与编辑。
4. 优点：真实、快；缺点：没有房间语义、资产较大。

**方案 B：结构化层（2–4 周试点）**

1. 视频 → 点云（VGGT / MASt3R-SLAM）。
2. SpatialLM 推理出墙/门/窗/房间/家具框。
3. 与 OSM 轮廓、已知层高/门宽对齐，规则化生成简化体块与房间；人工审一遍。
4. 产出可点击、可编辑、可“进入室内”的模型，最接近“视频还原建筑模型交互”的目标。

**方案 C：世界模型宣传片**

用 Marble / Genie / ABot 生成可探索概念世界，做宣传、教学、概念漫游；**不要**替代测绘或施工图。

**拍摄与精度提示**

- 视频重建只到“观感级”；报建/测绘需激光扫描、全站仪或已知标尺。
- 玻璃、镜面、纯白墙、大面积天空是难点，要多角度补拍。
- 3DGS 适合“看到的真实”，BIM/平面图适合“可量测的结构”，两者最好叠加使用。

**许可证与成本**

- VGGT 权重 CC-BY-NC、SHARP 非商用、LongSplat 视 NVIDIA 条款；商用可换 TripoSplat（MIT）或自研。
- Marble / World API、Genie（AI Ultra）、部分商业重建服务均按订阅/积分计费。
- 无人机拍摄需遵守当地空域与校园许可规定。

## 参考链接

- VGGT：<https://github.com/facebookresearch/vggt>
- LongSplat：<https://github.com/nvlabs/LongSplat>
- DepthSplat：<https://github.com/autonomousvision/depthsplat>
- Splatline：<https://github.com/jaskirat1616/Splatline>
- SpatialLM：<https://github.com/manycore-research/SpatialLM>
- Spark：<https://sparkjs.dev/>
- SuperSplat：<https://superspl.at/editor>
- World Labs World API：<https://www.worldlabs.ai/blog/announcing-the-world-api>
- World Labs Atlas 实时：<https://www.worldlabs.ai/blog/atlas-realtime>
- Genie：<https://deepmind.google/models/genie/>
- Project Genie 真实地点：<https://www.digit.in/news/general/google-project-genie-can-now-turn-real-locations-into-interactive-ai-worlds-here-is-how.html/amp/>
- ABot-World：<https://www.manilatimes.net/2026/07/16/tmt-newswire/pr-newswire/alibabas-amap-unveils-abot-world-ai-models-that-generate-interactive-video-and-3d-scenes-for-hours-on-a-single-gpu/2385639/amp>
- Polycam：<https://poly.cam/tools/gaussian-splatting>
- Realsee：<https://www.realsee.ai/>
- Cintoo 360：<https://www.geoweeknews.com/articles/cintoo-launches-360-edition-bringing-ricoh-native-360-data-into-3d-workflows/>
- Scan-to-BIM 综述：<https://ieeexplore.ieee.org/document/11584150>
