# AI 一次生成可玩 3D 网页游戏：技术拆解与对本图志的可用性评估

> 调研时间：2026-11-12。对象：X 用户 @Mulight（沐光）转发的「几猫」网页 FPS（单文件 1.4 MB，仓库 `github.com/blueRaining/temp`）。
> **溯源结论：它不是「几猫」的原创。** 原版是 Anthropic 员工 Felix Rieseberg 用 Claude Fable 5.2 一次提示词生成的 demo《Saltline》（2026-11-09 发布）；中文圈把它汉化、改名、加上「国产/自主研发」字样后，以「几猫 6 小时做出 3A」的形式传播（见 §1）。本文仍按我实际拆过的那个 1.4 MB 文件做技术分析，但归属、耗时与「自研」说法以一手来源为准。
> 本文不是功能承诺，只回答三个问题：**消息是否可信、它用了什么技术、哪些能用于本仓库（Three.js 校园图志）**。

---

## 一句话结论

1. **传播链上有三处失真**：原创是 Felix Rieseberg 的《Saltline》，不是「几猫」；耗时一手是 **8 小时**（不是 6 小时）；「国产 3A / 自主研发」是汉化版页面上后加的文字。**属实的是**：1,425,707 字节单文件、零外部素材、完整的自写渲染/音频管线（我逐项核对过）。
2. **它的技术本质不是「AI 画美术」，而是「程序当美术」**：Three.js r180 + 程序化材质/贴花/天空 + 自写后处理 + WebAudio 合成 + 单场景关卡。全部是可公开复现的通用 WebGL 技术，没有模型侧黑科技；文件里仍保留 `SALTLINE_*` shader 前缀，是同一份代码的直接证据。
3. **对本图志：能借鉴，不能照搬**。性价比最高的三件事是 **环境反射（PMREM，本仓库代码里已明确记录这个缺口）→ 轻量后处理（AO/bloom）→ 程序化材质加 normal/ORM**；加上最有工程价值的 **截图基准 + 逐像素回归 harness**（已验证可在本仓库跑通，见附录 B）。不建议把 FPS 战斗、运动模糊/色差/受击特效或「整包 minified 单文件」搬进一个以阅读和校正为核心的建筑图志。

---

## 1 原始消息与可核查事实

推文大意（用户提供的截图）：*「这就是 Claude Fable 5.2 能力吗？也太强了……几猫大佬用 Fable5.2 仅花了 6 个小时就做出了可以媲美 3A 大作的游戏，大小只有 1.4M……光影效果、场景交互、流畅度等都不下于一些 3D 大作了」*，仓库链接截断为 `github.com/blueRaining/te…`。

### 1.1 溯源：这是《Saltline》的汉化改名版

| 环节 | 一手事实 | 证据 |
|---|---|---|
| 原作者 | **Felix Rieseberg**（Anthropic 员工、Electron 共同维护者），用 Claude Fable 5.2 做了三游戏合集「Three Games」，其中一款是《Saltline》 | [案例页](https://claude.ai/artifact/BGY1SztrAYcJQHSsnHHGmp)、[作者主页](https://felixrieseberg.com/) |
| 原推 | 2026-11-09 22:50 UTC：*「Everything in this game is from scratch: models, sounds, textures. ~$550 at API pricing, ~2.7M output and 445M input tokens, heavily cached. **Took 8 hours!**」*；4,025,253 播放 / 13,746 赞 | [原推](https://x.com/felixrieseberg/status/2119925633564463609)（经 fxtwitter API 取结构化字段） |
| 提示词 | 作者公开：*「…build me a FPS. Insanely detailed quality pls, something that looks visually like it can keep up with AAA. Make it small in scope (like a tiny level)…」*；案例页另注：初版由 Claude 一次生成、无人工反馈，作者随后又花约 2 小时改进武器/声音/玩法 | [第二条推](https://x.com/felixrieseberg/status/2119927483994907024)、案例页 |
| 汉化改名 | 上传者 `blueRaining/temp` 于 **2026-11-11 02:33 UTC** 建仓，只推了一个 HTML；页面内 33 处「几猫」，但 shader 前缀仍是 `SALTLINE_SKY / SALTLINE_SHADOW / SALTLINE_POST` | 仓库 API + 本地文件 grep |
| 第三方纠偏 | 归档仓库 [Megasu/jimao-3a-game](https://github.com/Megasu/jimao-3a-game) 明确写：文件与截图中的「几猫国产 3A 大作」「自主研发」等文字**来自收到的版本，不应作为原作名称、作者归属或开发来源的依据**；B 站播放量最高的版本也在简介里署原作者 Felix | 仓库 README、B 站视频简介 |

### 1.2 逐条核对推文主张

| 推文主张 | 核查结果 | 判断 |
|---|---|---|
| 「几猫」用 Fable 5.2 自主研发 | 证伪：同一份 Saltline 代码改了品牌与中文文案；原版没有「自研」说法 | ❌ 失真 |
| 仅花 6 小时 | 与一手 8 小时不符；「6 小时」在中文转述里出现，但没有一手来源 | ❌ 失真 |
| 大小 1.4M | 文件 **1,425,707 字节 = 1.36 MiB**（`gzip -9` 后 435 KB） | ✅ 属实 |
| 玩法像简化版使命召唤 | 单港区场景、切断 3 处中继、3 类机械敌人、1 把步枪、结算评级 | ✅ 属实（「简化」到只有一个场景） |
| 光影/交互/流畅度不输 3D 大作 | 管线完整度确实高（§3.2–3.5），但没有公开帧率数据；同类项目的实测是 Retina 28–30 fps（Claude of Duty，另一个项目） | ⚠️ 主观，需实测 |
| 「3A」「初稿」 | 作者提示词只要求「看起来能跟 AAA 掰手腕」，从无 3A 评测；「初稿」也不准确——案例页的当前版是初版之后又迭代过的 | ⚠️ 营销口径 |

> 转载链补充：@Mulight 偏 Web3/AI 内容账号（非开发者），其原推正文需要登录态，本文未能直接取到，引述以用户截图为准；仓库 `blueRaining/temp` 的两次提交只证明上传时间（11-11 10:33/10:37 CST），不证明生成耗时。

**为什么仍值得研究？** 因为技术是真的：1.36 MiB 内塞下 three.js r180、29 套程序化 PBR 材质、自写后处理与 WebAudio 合成。这套「用代码换资产」的方法，恰好是数字孪生/建筑可视化的核心成本项——而这次传播的搬运者 `blueRaining` 本人就是 Babylon.js 数字孪生工具（Next3D）的作者。

---

## 2 这类项目不是孤例：2026 年的同类清单

| 项目 | 模型 / 方式 | 规模与耗时 | 技术要点 | 许可 |
|---|---|---|---|---|
| **Saltline**（本次舆论的原始对象） | Claude Fable 5.2，单提示词、无人工反馈 + 约 2h 人工打磨 | 8h / ≈$550 / 2.7M 输出 + 445M 输入 token / 1.36 MiB 单文件 | three.js r180、程序化几何/材质/音效、自写后处理（AgX+ACES、bloom、软阴影、实时反射） | 未开源（Claude Artifact） |
| **几猫国产3A大作**（汉化改名版） | 无（翻译/改名） | 同一文件、同体积 | 同上 + 中文 UI 与「项目介绍」 | ❌ 无 LICENSE |
| **Claude of Duty**（mshumer） | Claude Opus 5，多 agent + `ARCHITECTURE.md` 契约 | ~55k 行、11 子系统；现 3.5k★/537 fork | 19 种程序化材质（Sobel 法线、POM、triplanar、曲率磨损）、自写 BVH 物理、GTAO/TAA/PCSS、5 个 harness 工具 | ✅ MIT |
| **CS-Clone-Fable5** | Claude Fable 5（Claude Code），单 prompt | 约 25 分钟、~1,850 行 / 10 文件 | Three.js + Node `ws` 权威服务器：回合状态机、经济、服务端弹道、hitbox、快照插值；模型自写 headless 集成测试（25 条断言） | 未声明 |
| **SUBLEVEL 07**（wquguru 复现） | Fable 5.2，73 轮 / 40.8 分钟 / ≈$16 | 131 KB 单文件 | 仅 three.js、零资源；agent 自己用浏览器截图自检 | ✅ MIT |
| **Gears of War: E-Day 克隆**（Matthew Berman） | Fable 5.2 Ultra Code，43h48m / 86.3 亿 token / ≈$14,710 | 单关卡 | **UE5**（不是 Web） | 未开源 |
| **《云海神殿》**（沧沧凉凉） | Claude Code，33 个 subagent | 5 章节 + Boss，可通关 | three.js、零素材、程序化建模/贴图、WebAudio 合成 BGM | 见原文 |
| **Ethan Mollick 的 Fable 5 实验** | Fable 5，单 prompt | Snake / Strata / Duino / 等时地图 | 2D/小品 3D；报道原话：亮点在「能被生成」而非画质与深度 | 见 TechCrunch |

共同点：**零素材 + 程序化生成 + 浏览器 + 单场景 + 强后处理**；差距也很一致：**内容量、近景材质真实度、性能、可维护性**。

第三方标尺：Artificial Analysis 的 [AA-3D](https://artificialanalysis.ai/evaluations/aa-3d)（55 个 three.js 交互场景、盲投 Elo）里，Fable 5.2 以 **1271** 排第一（Sonnet 5.5 1204、Opus 5.5 1202）——但它测的是「单场景」，不是「完整游戏」。

---

## 3 Saltline（几猫汉化版）的技术拆解

以下结论来自对 `几猫国产3A大作_V1.html` 的实测（命令见附录 A）。该文件与原版 Saltline 同源（`SALTLINE_*` shader 前缀、`claude:viewport-fit-sides` meta 都还在），中文 UI 与「几猫」命名是二次修改；下列数值以我拆的这份副本为准。

### 3.1 发布形态

- 单个 HTML，内联 three.js **r180** 与全部业务代码（IIFE、变量名混淆）；**无任何外部 URL、无 base64 图片、无 `data:` 贴图**——真正的零素材自包含。
- 字体走系统 `PingFang SC`/`Microsoft YaHei` 回退，不内嵌字体；这解释了它为何能压到 1.4 MB（本图志单文件 1.9 MB，其中 6 个 WOFF2 字体内联）。
- 无 `license` 文件；three.js 自身的 MIT 声明被压缩进 bundle。

### 3.2 渲染管线（自写，未用 EffectComposer）

从代码可还原出的 pass 链（RT 全部半浮点；AO/体积光为半分辨率）：

```
scene RT (HalfFloat)
 ├─ depthcopy → depthhalf（半分辨率深度）
 ├─ ao（12 taps，半径/强度可调）→ blur-ao（深度感知双边模糊）
 ├─ vol（16 步体积光，采样 shadow map + 场景包围盒尘埃）→ blur-vol
 ├─ composite（AO × volumetric 合成回颜色）
 ├─ motion（上一帧 viewProj 重投影，shutter 0.5）
 ├─ down×6 / up×5 → bloom（6 级降采样 + 5 级升采样，dual filtering 风格）
 ├─ streak（anamorphic 拉丝）
 ├─ adapt（1×1 自动曝光）
 ├─ dirt（镜头污渍）
 └─ grade：AgX（Filament 拟合，与 ACES 混合 uAgxMix）、bloom/dirt/streak/flare/CA/vignette/
            damage/lowHealth/ADS/flash/fade/saturation/grain/sharpen 等 20+ 参数
```

- 阴影仍是 three 自带 shadow map（PCFSoft 一类），**没有级联阴影/PCSS**；体积光是「阴影贴图深度 + 光线步进」的近似，不是真 GI。
- 未见 TAA/时域抗锯齿（只有基于上一帧 `viewProj` 重投影的运动模糊），未见 SSR/反射探针；环境反射来自天空 PMREM（§3.4）。没有后处理库依赖；bundle 内 500 字节以上的 GLSL 模板字符串合计约 1.18 MB（含 three 自带 shader chunk），业务 shader 以可读注释保留，可据此还原 pass 链。

### 3.3 材质系统

- **29 套程序化材质集**，48 个变体：`asphalt、concrete、brick、epoxy、paint、hull、galv、metal、brushed、rust、diamond（花纹钢板）、corrugated、chainlink、hazard、gunmetal、anodized、polymer、carbon、fabric、armor、wood、plastic、tarp、cardboard、rope、tire、glass、glass_dirty、water`。
- 每套在运行时生成 albedo + normal（按 `bump` 强度从高度图求差分）+ ORM（roughness/metalness/AO 打包，`DataTexture`），并带 `wet`（湿/积水）、`macro`（宏观色差）、`paint damage`（掉漆→底材→锈迹流挂）参数。
- 支持 **triplanar** 变体：对没有合理 UV 的曲面/拉伸体，按世界坐标三向投影混合，避免 UV 拉伸。
- 中文标牌/集装箱编号/铭牌全部用 Canvas 程序化绘制（如「几猫港区 B4-0271」「安全检验铭牌 SL/PA-4207/19」），并按材质遮罩贴到容器表面。

### 3.4 天空与环境反射

- 自定义天空 shader `SALTLINE_SKY`：分层云床、Mie 光晕、闪电（`uFlash`）、昼夜时间变化。
- 关键细节：用 `PMREMGenerator.fromScene()` 把「天空材质 + 噪声」渲染成环境贴图，给全场景 PBR 材质提供**环境反射**（代码中`uEnv` 置 1、金属/玻璃据此得到反射）。这是它观感明显比「无环境贴图」的场景干净的主要原因之一。

### 3.5 音频（零音频文件）

- 自建 WebAudio 总线：`world / near / amb / music / dry` 分组 → compressor → waveshaper（饱和）→ lowpass。
- **两个卷积混响**，脉冲响应由代码生成（`ir_outdoor` / `ir_shed`）。
- `PannerNode` HRTF 空间化 + 距离衰减 + 低通滤波。
- 武器、脚步、机械敌人、环境声全部实时合成。

### 3.6 交互与物理

- FPS 控制器（WASD/冲刺/蹲伏/跳跃/ADS/换弹），命中与视线用射线查询；**没有自建 BVH，也没有物理引擎**（对比 Claude of Duty 的 29k 三角形 BVH，这是明显的简化）。
- 4 档画质（低/中/高/极高）、鼠标灵敏度/FOV/音量、触屏双摇杆 + 按钮、移动端安全区适配。

### 3.7 它没有做的东西（诚实清单）

- 没有真 GI/间接光；没有 TAA；没有级联阴影；没有 SSR/反射探针；没有 LOD 系统（有 `frustumCulled` 但未见 LOD 分级）。
- 没有内容量：1 个场景、3 个目标、3 种敌人、1 把枪；未见多人/存档/关卡编辑。
- 没有可维护的源码：单文件压缩产物，变量名不可读，没有模块边界。

---

## 4 与本图志的技术对照

| 能力 | 本图志（现状） | Saltline（几猫版） | 差距 → 机会 |
|---|---|---|---|
| 引擎 | three.js **r169**（`vendor/three.module.js`，模块化） | three.js **r180**（内联压缩） | 差 11 个小版本；r170+ 有 `AgXToneMapping` 等新特性 |
| 发布形态 | Rollup 打包 + 字体内联成 1.9 MB 单文件；另有模块化开发版 | 1.36 MiB 单文件 | 两者都自包含；我们保留了源码结构（✅ 别丢） |
| 程序化贴图 | `js/textures.js` 24 个生成器：**仅 albedo**（另少量 emissive） | 29 套 PBR：albedo + normal + ORM + wet/macro/damage | **加 normal/ORM 是近景观感的最大缺口** |
| 环境反射 | **无 envMap/PMREM**；`js/landmarks/library.js` 里明确注释「没有环境贴图，metalness 高会发黑」，用自发光补 | PMREM fromScene 程序化天空 | **最高性价比的单点改进** |
| 后处理 | 无 | AO + 体积光 + bloom + 运动模糊 + 自动曝光 + AgX grade | 可择要引入；注意纸感审美与移动端 |
| 天空 | 简单渐变球 + 日面光晕（`campus-accurate.js`） | 分层云 + Mie + 闪电 | 可为黄昏/雨天加分，但非必需 |
| 光照 | Hemi + Sun + Moon + Fill + Ambient + 夜间点光；PCFSoft 2048；`shadowMap.autoUpdate=false` | 同类 + 体积光/AO/自动曝光 | 我们已有夜间点光与窗光，缺接地 AO |
| 材质风格 | 低模写意、纸感编辑设计 | 写实港区、湿润反射 | **审美不同，不要照搬写实调色** |
| 音频 | **无** | 全套 WebAudio 合成 + 卷积混响 | 环境声（铃声/鸟/风/雨）是低成本高收益 |
| 交互 | OrbitControls + 点击图志 + 自动巡游 + 影片录制 | FPS 键鼠/触屏 | 可选第一人称步行模式 |
| 内容 | 20 处地景、4 座重点建筑逐项复原、室内、6 种天气、学生行为、85s 影片、小地图 | 1 个场景 | 我们的内容厚度是它的 10 倍以上 |
| 工程 | 模块化 + 文档（`docs/`）+ 构建脚本 + 工具页 | 单文件压缩产物 | 我们的工程形态更健康 |
| 视觉验证 | `tools/scene-check.js`（场景几何体量检查） | 无（Claude of Duty 有 5 个 harness 工具） | **缺「截图基准 + 像素回归 + 帧时间分布」** |

> 顺带一个观察：本仓库自身也是 AI 在 `2026-11-08 16:39:37` 首次提交、75 秒后 `16:40:52` 一次性落地约 1 万行 JS（现约 1.9 万行）的产物，随后两天做了模块化、室内/天气/影片与逐项校正。也就是说——**「AI 能不能生成」已经不是差异点，差异点在生成之后的测量、校正与可维护性**。这一点恰好是 Claude of Duty 的 README 反复强调的。

---

## 5 能不能「直接用到当前项目」？

分三档。判定标准：**是否服务「可读、可校正、可分享的建筑图志」这个产品目标**，以及移动端性能/页面体积预算。

### A 档：可以直接借鉴（低风险、高收益）

1. **PMREM 环境反射**（2026-11-12 已实现，见 `js/campus-accurate.js` 的 `bakeEnvironment`）
   - 现状：无 envMap，金属/玻璃只能靠压 `metalness` + 加自发光「假亮」。
   - 已落地的做法：复用现有天空 shader → 只含天空材质的临时 Scene → `PMREMGenerator.fromScene()` → 仅给 `metalness ≥ 0.15` 的材质（金属/玻璃/水面）挂 `envMap`，`envMapIntensity ≈ 1.2`；不用全局 `scene.environment` 提亮（会把纸感冲淡）。日照/天气变化时按 0.25 s 节流重烘，旧 RT dispose；`?env=off` 可 A/B。
   - 影响面：图书馆银穹顶、玻璃幕墙、地理园水池、校门铜饰、体育馆金属雨棚、夜景窗光。
2. **截图基准 + 逐像素回归 harness**（2026-11-12 已实现：`tools/shot.mjs`、`npm run shots`）
   - 直接照搬 Claude of Duty 的思路（它是 MIT）：固定机位列表 → 每张独立页面、固定帧预算截图 → 基准图入库 → `imagediff` 阈值门控 → 输出 p50/p95/p99 帧时间与 shader 编译计数。
   - 本仓库已有 `tools/model-preview.html`、`tools/scene-check.js` 可作为机位与场景入口；把 `?hour=`、`?campus=`、`?spot=` 作为参数化维度。
   - 这是后续所有视觉改动的**验收基础设施**，应当先做。
3. **程序化材质补 normal + ORM**（2–3 天）
   - 在 `js/textures.js` 的高度/噪声阶段顺便输出高度图 → Sobel 求法线；roughness/metalness/AO 打包进一张 ORM（three 的 `roughnessMap` 读绿、`metalnessMap` 读蓝，同一张纹理可复用）。
   - 优先对象：红砖、红瓦、浅色抹灰、石板、沥青、塑胶跑道、木饰。近景（校门匾额、凤栖堂柱础、图书馆台灯）提升最明显。
4. **WebAudio 环境声**（1 天）
   - 与 `js/weather.js` 的天气状态天然联动：晴（鸟/蝉/远处球场）、雨（雨幕/檐水）、台风（风啸/金属晃动）、雪（安静 + 风声）、夜间（虫鸣）。
   - 注意：默认静音/需用户手势才能启动 AudioContext；提供一键静音，遵守 `prefers-reduced-motion` 类似的克制原则。

### B 档：改造后可用（收益明确，但要控成本）

5. **轻量后处理：AO + bloom + 可选 AgX**（2–4 天）
   - AO（半分辨率 8–12 taps + 双边模糊）能显著改善檐口、连廊、架空层的「接地感」，对低模场景收益很大；bloom 只对夜景/路灯/水面开放；AgX 可做成设置项（保留 ACES 为默认，避免纸感被压灰）。
   - 必须分档：桌面开、移动端关或半分辨率；把「后处理开关」并入现有天气/日照面板之外的画质设置。
6. **体积光/丁达尔**（1–2 天，移动端风险）
   - 黄昏、暴雨、台风时最出片，但 16 步半分辨率在手机上偏贵；建议做成「影片模式专属」或按 `?quality=high` 才启用。
7. **第一人称步行模式**（3–5 天）
   - 复用 `js/film.js` 的相机关键帧系统与现有室内场景；碰撞用「胶囊 + 简单 AABB/射线」即可（不需要 BVH）；与「点击建筑进入图志」并存（点击暂停步行）。
   - 这是把「图志」变成「可走进去的校园」最直接的一步，也最贴合本项目的原始动机。
8. **画质分档 + 自适应 DPR**（1 天）
   - 现有 `setPixelRatio(min(dpr,1.5))` 是固定值；可参考其 4 档思路，按 p95 帧时间动态降档。

### C 档：不建议搬（会伤害产品）

9. FPS 战斗、敌人 AI、HUD/准星/击杀提示、结算评级——与本项目定位无关。
10. 运动模糊、色差、镜头污渍、受击闪白、低血量滤镜——建筑阅读场景会晕、会脏，且与「图志」的克制气质冲突。
11. **整包 minified 单文件**——无 license、无模块边界、不可 review；我们保留 `js/` 模块 + `build.mjs` 的形态。
12. 写实湿润调色——本仓库的视觉身份是纸感编辑设计（见 `assets/preview/overview.jpg`），照搬会变成「另一个游戏的截图」。

---

## 6 建议的落地路线

| 阶段 | 内容 | 工作量 | 风险 | 验收 |
|---|---|---|---|---|
| 0 | 视觉回归 harness：8 个固定机位（总览/校门/凤栖堂/图书馆/夜景/雨/雪/移动端）× 基准图 + `imagediff` + 帧时间分布 | 0.5–1 天 | 低 | 改动前后 diff 可解释；单文件 gzip 增量 < 5 KB |
| 1 | PMREM 环境反射（随日照/天气重建，限频 + dispose） | 0.5 天 | 低 | 金属/玻璃不再发黑；性能 p95 不劣化 |
| 2 | 材质 normal + ORM（先做 6 类主材） | 2–3 天 | 中（内存/加载时间） | 近景截图对比；首次加载 gzip 增量 < 30 KB |
| 3 | 后处理：AO + bloom（分档，移动端降级） | 2–4 天 | 中高（移动端帧率） | 桌面 ≥ 50 fps、移动端 ≥ 30 fps；可一键关闭 |
| 4 | 天气联动环境声（默认静音/需手势） | 1 天 | 低 | 五类天气各一段可感知差异；静音状态持久化 |
| 5 | （可选）第一人称步行模式 | 3–5 天 | 中（交互复杂度） | 与图志/巡游/影片互不打架；Esc 退出 |

合计 A+B 主干约 **1–2 周**（按现有单人 + agent 协作节奏）。建议严格按 0 → 1 → 2 → 3 顺序，**每个阶段都先跑 harness 再合入**。

### 如果目标是「做一个可玩的校园版」而不只是图志

值得做，而且成本比从零做一个 FPS 低得多：几何体已经存在（`buildCampus()` 的 20 处地景 + 室内），缺的是第一人称控制器、碰撞、交互点（打卡/寻宝/校史问答）、音频与目标/结算 UI。按 Saltline 的模块清单估算：控制器 1–2 天、交互与任务 2–3 天、音频 1–2 天、UI/结算 2 天、性能与适配 2–3 天，**约 1.5–2 周**能出一个「可走、可交互、有目标」的校园体验版；但它的性质会从「图志」变成「小游戏」，建议作为独立入口（如 `?mode=walk`）而不是替代主页面。

---

## 7 许可证、维护成本与组织方式

- **许可证（重要）**：原版《Saltline》只存在于 Claude Artifact，**没有开源许可**；`blueRaining/temp` 与汉化版也无 LICENSE；归档仓库虽自加 MIT，但明确声明不覆盖原作。→ **不能复制它的任何代码/贴图生成器**，只能当效果参照。可借鉴的是 MIT 的 [Claude of Duty](https://github.com/mshumer/Claude-of-Duty)（harness 思路）与 three.js（MIT）；AgX 拟合公式来自 Filament（Apache-2.0）。
- **AI 生成游戏的版权边界在收紧**：Anthropic 已在 2026-11 更新规则，禁止用 Claude 复刻既有游戏（「即便改名也不行」），背景是浏览器里出现 Halo/CoD/GTA 的 AI 复刻（[Engadget](https://www.engadget.com/2303469/anthropic-updates-claude-to-stop-it-from-recreating-existing-video-games/)、[36 氪](https://36kr.com/p/4054959981990787)）。本项目是原创校园重建，不受影响；但引用他人作品/素材时要更谨慎。
- **AI 代码维护成本**：常被引用的「12x 维护税」并不可靠（原始数字是 token 成本乘数）。更扎实的证据是微软内部的差分研究：外围贡献者 commit +43.5%、PR +17.7%，核心贡献者 commit −19%、review +6.5%，PR rework +2.4%——**工作量没有消失，而是向架构负责人转移**（[GitMe](https://www.gitdotme.com/blog-hidden-maintenance-tax-ai-assisted-coding)）。对应到本图志：渲染管线这类耦合系统必须由单一 owner 串行推进。
- **组织方式**：Claude of Duty 的 README「Process note」给了一个反直觉但重要的结论——耦合系统（tonemapping / 天空 / 间接光）用「串行单 owner」明显优于「并行多 agent 分目录」：三轮并行 fan-out 只 +0.46 分、缺陷反而变多；一轮串行单 owner +1.00 分、缺陷 66 → 26。本项目的渲染改动应按阶段串行，内容/数据类工作（`js/data.js`、`js/site.js`）才适合并行。
- **发布形态**：单文件是「分发格式」，不是「代码库」。继续用 `js/` + `build.mjs` 产出 `hainan-middle-school.html`，两套都保留。
- **体积的真相**：1.4 MB 不是「压缩神迹」，而是**存生成配方而不是资产**（贴图/模型/音频都是代码）；运行时内存/显存开销并不小。历史上 .kkrieger（2004，96 KB 完整 FPS）是同一思路的先例。对我们的意义：单文件版能保持 2 MB 级别，靠的是程序化贴图 + 内联字体，而不是素材压缩。

---

## 8 参考链接

- 原版《Saltline》案例页（Claude Artifact）：<https://claude.ai/artifact/BGY1SztrAYcJQHSsnHHGmp>
- Felix Rieseberg 原推（8 小时 / $550 / 2.7M tokens）：<https://x.com/felixrieseberg/status/2119925633564463609>
- Felix 公开提示词：<https://x.com/felixrieseberg/status/2119927483994907024>
- 汉化改名版上传仓库：<https://github.com/blueRaining/temp>（无 LICENSE；单文件 `几猫国产3A大作_V1.html`）
- 第三方归档与溯源声明：<https://github.com/Megasu/jimao-3a-game>
- Claude of Duty（MIT）：<https://github.com/mshumer/Claude-of-Duty>
- 开源派拆解《Claude of Duty：单段 prompt 写出 55k 行 Three.js FPS》：<https://osp.io/archives/11000>
- 云海神殿（33 个 subagent、零素材 3D 动作游戏）：<https://jishuzhan.net/article/2107118710456868866>
- CS-Clone-Fable5：<https://github.com/Gabry9110/CS-Clone-Fable5>
- SUBLEVEL 07 复现（MIT）：<https://github.com/wquguru/fable52-fps-repro>
- Gears of War: E-Day 克隆（43h / ≈$14.7k，二手报道）：<https://jctechspace.com/claude-fable-5-2-builds-gears-of-war-e-day-clone/>
- AA-3D 交互式 3D 场景榜：<https://artificialanalysis.ai/evaluations/aa-3d>
- Anthropic 禁止复刻既有游戏（Engadget）：<https://www.engadget.com/2303469/anthropic-updates-claude-to-stop-it-from-recreating-existing-video-games/>
- Fable 5 单 prompt 生成游戏（TechCrunch 经答鸭转述，Ethan Mollick 测试）：<https://dayaai.com/news/story/2397>
- Fable 5.2 单指令生成 FPS（Felix，约 8 小时 / 约 $550，土耳其媒体转述）：<https://shiftdelete.net/fable-5-2-tek-komutla-fps-oyunu-yapti>

> 说明：本文未直接抓取 @Mulight 的推文原文（需登录态），对推文的引述来自用户提供的截图；「6 小时」与「自主研发」按 §1 的证据判定为失真。

---

## 附录 A 复现核查命令

```bash
# 1) 取仓库与文件
curl -s https://api.github.com/repos/blueRaining/temp | python3 -m json.tool
curl -sL "https://raw.githubusercontent.com/blueRaining/temp/main/几猫国产3A大作_V1.html" -o /tmp/jimao3a.html
ls -l /tmp/jimao3a.html                # 1425707 bytes
gzip -9 -c /tmp/jimao3a.html | wc -c   # 445948 bytes

# 2) 溯源：这份文件其实是 Saltline 的汉化改名版
grep -o 'SALTLINE_[A-Z]*' /tmp/jimao3a.html | sort | uniq -c
grep -o '几猫' /tmp/jimao3a.html | wc -l
grep -o '<meta name="claude[^>]*>' /tmp/jimao3a.html

# 3) 一手耗时（原推，经免鉴权的 fxtwitter API）
curl -s https://api.fxtwitter.com/felixrieseberg/status/2119925633564463609 | python3 -m json.tool | head -30

# 4) 技术核对：引擎版本与 pass 名（压缩 bundle 里仍保留 GLSL 注释与 pass 名）
grep -o 'revision:"[0-9]*"' /tmp/jimao3a.html
grep -oE '"(scene|depthhalf|ao|blur-ao|vol|blur-vol|composite|motion|down|up|streak|adapt|dirt|grade)"' /tmp/jimao3a.html | sort | uniq -c
```

## 附录 B 本图志可立即试验的三个 spike

1. **PMREM（半天）**：在 `js/campus-accurate.js` 天空创建处，用 `PMREMGenerator.fromScene(仅含天空材质的 Scene)` 生成 env；替换 `library.js` 里「压 metalness + 自发光」的临时方案，截图对比图书馆银穹顶与玻璃幕墙。
2. **AgX 对照（2 小时）**：升级 three 到 r180 后把 `renderer.toneMapping` 切换到 `AgXToneMapping`，用同一机位对比 `assets/preview/overview.jpg` 的纸感是否被压灰；决定是否做成设置项。
3. **harness 最小版（半天，已验证可行）**：`playwright-core` 驱动本机 Chrome（无头、`--no-sandbox`）能直接渲染本页并等待 `window.__campusReady`；实测 1440×900 可截到完整场景。三个坑：必须 `?nointro=1`（空值 `?nointro` 是 falsy，不会跳过开场）、等 ready 后约 2 s（加载层 980 ms 后才 `hidden`）、不要用 `--virtual-time-budget`（会误触页面 25 s 的看门狗，显示「三维场景未能加载」）。

