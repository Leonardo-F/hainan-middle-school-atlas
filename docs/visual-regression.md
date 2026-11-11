# 视觉回归 harness · 校园图志

> 目标读者：改 `js/` 渲染、材质、光照、天气、UI 布局的维护者，以及需要在本地自检的 agent。
> 适用版本：2026-11-12（开发入口 `index.html` + `?still=1` 确定性单帧）。
> 一句话：**固定机位截图 → 与本机基准逐像素对比 → 超阈值退出码 1**，防止「改 A 弄坏 B」。

---

## 0. 30 秒速览

```bash
npm install            # 一次性：playwright-core + pngjs（本机需已装 Chrome）
npm run shots:update   # 首次使用 / 确认画面改动符合预期后，重建基准
npm run shots          # 日常门控：与基准对比，有差异退出码 1
```

- 机位矩阵：`tools/shots.mjs`（当前 9 个：总览正午/黄金时刻、夜景俯瞰、校门、凤栖堂、图书馆、暴雨、雪、手机竖屏）。
- 截图与对比：`tools/shot.mjs`；逐像素对比与 diff 图：`tools/imagediff.mjs`。
- 输出目录：`tools/shots/{baseline,current,diff}/`，**已被 `.gitignore` 忽略，基准图不入库**。
- 失败时先看 `tools/shots/diff/<机位>.diff.png`（红色 = 不同像素，灰色 = 相同）。

---

## 1. 原理

```
临时 HTTP 服务（仓库根, 随机端口）
        │
        ▼
/index.html?still=1&nointro=1&<shot.query>   ← 开发入口，测 js/ 源码，不依赖 build
        │
        ├─ 等 window.__campusReady === true    场景与首帧相机就绪
        ├─ 等 window.__stillReady  === true    确定性单帧已渲染
        ├─ 等交互提示 1.8s CSS delay 结束       该提示的 opacity 过渡走完（稳定可见）
        ├─ 等布局落定 + 双 rAF                  面板开合/移动端重排会 resize canvas
        ├─ weather.tick × 240 → renderer.render 天气缓动推进到稳态，重绘一帧（再补一帧）
        ▼
     page.screenshot() → tools/shots/current/<shot>.png
        │
        ▼
comparePng(baseline, current) → diffPixels / ratio / diff 图
```

关键设计：

1. **测开发入口，不测构建产物。** 页面由 `tools/shot.mjs` 临时起的 Node 静态服务从仓库根提供，加载 `/index.html`（ES module + `vendor/three.module.js`）。`hainan-middle-school.html` 是 `npm run build` 内联出的 1.9MB 单文件，测它意味着「改完 js 忘了 build」时门控会假绿或假红，也无法定位是源码还是构建的问题。改 js 后直接跑截图即可，无需 build。
2. **`?still=1` 是确定性的来源。** `js/main.js` 在 `still` 模式下：把 `Math.random` 换成固定种子的 PRNG（种子 `20261112`）、`renderer.setAnimationLoop(null)`、`clock.stop()`，在 `finishBoot()` 后延时渲染**恰好一帧**并置 `window.__stillReady = true`。`?nointro=1` 跳过入场相机动画；`reducedMotion: 'reduce'`（Playwright context 参数）让 CSS 过渡/动画近似 0，`main.js` 也据此缩短加载节拍。**但 reducedMotion 只压缩 `transition-duration`、不压缩 `transition-delay`**：舞台右下角的交互提示（`拖动旋转 · 滚轮缩放 · 点击建筑`）带 1.8s 延迟，页面启动快慢会让截图时这行小字时有时无（实测 overview-noon 同一机位 0 px 与 468 px 交替）。所以脚本在截图前显式等 `getComputedStyle(#interactionHint).opacity >= 0.8`，把它稳定在「可见」状态；`spot` 机位打开图志时会 `markInteracted()`，提示按设计保持隐藏（此时脚本看到 `has-interacted` 就直接通过）。
3. **天气缓动在截图前推到稳态。** 天气层（`js/weather.js`）的雨/雪粒子、地面积雪、曝光、雾、天空色都按**真实墙钟**做指数缓动，冻结帧只保证「之后不再更新」，不保证「过渡已经走完」——同样等 `__stillReady`，页面首帧的快慢会让积雪停在 60% 还是 95%，跨运行差到 10% 以上。因此 `tools/shot.mjs` 在截图前通过公开 API `window.__campusDebug.weather.tick(0.05)` 连推 240 次（12s 模拟时间）让所有缓动收敛，再 `renderer.render(scene, camera)` 重绘一帧然后截图。这步只改 harness，不需要改 `js/`；代价是天气机位测的是「天气稳定后的画面」，而非切换瞬间。
4. **每个 shot 都是全新 browser context / page。** 曝光（`toneMappingExposure`）、天气过渡、粒子、相机补间、滚动/焦点等状态不跨 shot 复用；复用同一 page 会让第二张图带上第一张的残留，见 [§5.1](#51-坑一复用同一页面曝光与粒子状态污染)。
5. **对比算法。** `comparePng` 用 pngjs 逐像素比较；单通道差值 > `channelTolerance`（默认 6/255）记为「不同像素」，`ratio = diffPixels / (width × height)`。尺寸不一致永远视为失败（`status: size-mismatch`）。
6. **不用 `--virtual-time-budget`。** 原因见 [§5.2](#52-坑二virtual-time-budget-会触发页面的-25s-看门狗)。

---

## 2. 用法

| 命令 | 行为 |
| --- | --- |
| `npm run shots` | 截图并逐个对比基准。全部在阈值内 → 退出 0；任一超阈值/尺寸不一致 → 退出 1。**只比较，不写基准。** |
| `npm run shots:update` | 截图并用当前画面**无条件覆盖全部基准**；旧的 diff 图会被删除。无基准时自动创建并提示「已创建基准」。 |
| `node tools/shot.mjs --only=gate` | 只跑一个机位（调试单个机位时用，仍是「比较」语义）。 |
| `node tools/shot.mjs --update --only=gate` | 只重建某个机位的基准。 |
| `node tools/shot.mjs --threshold=0.001` | 覆盖全局默认阈值（`0.002` = 0.2%）；各机位 `tolerance` 仍与之取较大值。 |
| `node tools/shot.mjs --extra=env=off` | 给每个机位 URL 末尾追加参数，做 A/B 观察（例如关闭环境反射）。注意：`--extra` 生成的画面与常规基准不同，**不要**在这种模式下用 `--update` 覆盖正式基准，除非你就是要改默认渲染。 |

### 首次运行

```bash
npm run shots
# · overview-noon ... 已创建基准
# ...
# 本次新建了 9 张基准图；再运行一次 npm run shots 即可验证确定性。
```

没有基准时脚本不会报错，而是把本次截图写进 `baseline/` 并提示「已创建基准」，退出 0。**紧接着再跑一次 `npm run shots`**，确认除可解释的机位外都是 0 差异，才算基准可信。

### 退出码

| 退出码 | 含义 |
| --- | --- |
| `0` | 全部一致；或首次运行成功创建基准；或 `--update` 成功覆盖。 |
| `1` | 有截图超阈值、尺寸不一致，或对比函数报错。看 `tools/shots/diff/`。 |
| `2` | 参数/环境错误：找不到 Chrome、`--only` 机位不存在、`--threshold` 非法。 |

---

## 3. 如何加机位

编辑 `tools/shots.mjs`，在 `SHOTS` 数组里加一行：

```js
// tools/shots.mjs
export const SHOTS = [
  // ...
  { name: 'yanlin', viewport: [1440, 900], query: 'spot=yanlin&hour=11' }
];
```

规则：

- **`name` 唯一**，会成为 `baseline/<name>.png`、`current/<name>.png`、`diff/<name>.png` 的文件名。
- `query` **只放确定性参数**：`hour`、`view=top`、`spot=<landmark id>`、`weather=<id>`、`campus=<id>`。不要放时间戳/随机参数；`?still=1&nointro=1` 由脚本统一追加，不用手写。
- **`viewport`** 写成 `[宽, 高]`。宽 < 600 会自动按移动端 context（`isMobile`/`hasTouch`）加载；桌面与移动建议各留机位。
- 新机位涉及**无法冻结的动画**（粒子、雨丝等）时，加 `tolerance`（见 §4），否则可能永远差几个百分点。天气过渡（积雪/曝光/雾）已由脚本自动推到稳态，不需要额外配置。
- 加完后：

  ```bash
  node tools/shot.mjs --only=<新机位>          # 首次会创建基准
  node tools/shot.mjs --only=<新机位>          # 再跑一次，应为 0 px
  ```

  确认稳定后正常提交 `tools/shots.mjs` 的改动即可；基准 PNG 不需要提交。

---

## 4. 阈值与 per-shot tolerance

- 全局默认 `--threshold=0.002`，即 **0.2% 的像素**。1440×900 = 1,296,000 px，0.2% ≈ 2592 px。
- 实际生效阈值：`max(全局 --threshold, shot.tolerance)`。
- `channelTolerance`（`comparePng` 默认 6/255）用于吸收 GPU/PNG 编码的舍入抖动；它是「单个通道差多少算同色」，与「多少像素算差异」的 `threshold` 是两个维度。
- 当前唯一的 `tolerance`：

  ```js
  { name: 'heavy-rain', ..., tolerance: 0.015 }  // 1.5%
  ```

  雨丝 shader 由粒子时间驱动，天气缓动虽然已在截图前推到稳态（见 §1），但不同运行之间偶尔仍会有 0.0x% 的抖动（实测 0–0.2%），故保留 1.5% 作为安全余量。**这是有意保留的容差，不是漏改**；其余机位保持默认。`snow` 早期也曾因地面积雪停在缓动中途差 11%+，加上天气稳态推进后已稳定为 0 px，因此不再需要 tolerance。
- 不建议为了「让门控变绿」随意调大阈值或加 tolerance：先看 diff 图，确认差异是否真的是抗锯齿/粒子抖动，而不是布局或材质回归。若将来把天气时间也纳入 `?still=1` 冻结（需要改 `js/`），可把 `heavy-rain` 的 tolerance 收回默认值。
- 尺寸不一致（例如改了 viewport 或页面缩放）始终失败，不走 tolerance；这种改动需要 `--update` 重建基准。

---

## 5. 四个坑

### 5.1 坑一：复用同一页面，曝光与粒子状态污染

视觉回归必须在**每个机位之间新建 `browser.newContext()` + `newPage()`**，不要复用同一 page 只改 URL 参数。原因：

- 相机补间、`OrbitControls` 阻尼、图志卡片开合、滚动位置、`hover`/焦点状态都会残留。
- 天气层把曝光、雾、天空写成**从基线缓动**的状态（`cur.exposure`、`cur.fogBlend`…），上一机位的残值会推进下一机位的过渡进度。
- 甚至 `requestAnimationFrame` 的相位、`performance.now()` 起点都会影响「单帧」落在过渡的哪个位置。

`tools/shot.mjs` 的 `capture()` 每次创建并 `finally` 关闭 context，**不要把它改成复用**。

### 5.2 坑二：`--virtual-time-budget` 会触发页面的 25s 看门狗

`index.html` 里有一段引导脚本：若 25 秒后 `window.__campusReady` 仍非 true，就显示致命错误遮罩并隐藏加载层：

```js
window.setTimeout(() => { if (!window.__campusReady) showFatal(); }, 25000);
```

部分截图方案会用 CDP 的虚拟时间（`--virtual-time-budget` / `Emulation.setVirtualTimePolicy`）来「快进动画」。虚拟时间会把定时器直接推进到截止点，但 WebGL 帧并不一定同步画完，于是 25s 看门狗先触发，截图里是**错误遮罩而非校园**。本项目因此**完全不用虚拟时间**，而是靠 `?still=1` 的真单帧 + `waitForFunction` 等待就绪标志。

### 5.3 坑三：GPU / 字体 / 浏览器版本差异

- WebGL 输出依赖 GPU、驱动、抗锯齿、`toneMapping` 实现细节：同一台机器同 GPU 才稳定；换显卡、换 Chrome 大版本、macOS 升级都可能让整张图出现细碎差异。
- 字体已通过 `assets/fonts/*.woff2` 自托管并被 CSS 引用，但系统级 fallback、字形 hinting、emoji 仍可能随操作系统不同而变。
- 因此：**基准图不入库**，只在本地生成；不要在不同机器之间共享/比较 `tools/shots/baseline/`。`npm run shots` 在 CI 里跑之前，必须固定浏览器版本与渲染后端（例如固定容器 + SwiftShader），并把对应基准图放在 CI 自己的制品里。

### 5.4 坑四：冻结动画后，布局重排会把 canvas 清空

`?still=1` 会停掉 `renderer.setAnimationLoop`，所以**最后一帧之后没有任何自动重绘**。而图志面板打开（`is-panel-open`）、移动端切换布局、字体撑开行高等都会触发一次 `resize` → `renderer.setSize`，把 canvas 重新分配并**清空**。如果截图发生在这次 resize 之后，得到的就是「UI 正常、3D 区域一片奶油色」的空图（基线文件会明显偏小，例如 1.4 MB→65 KB）。

`tools/shot.mjs` 的修法：截图前 `await document.fonts.ready` + 双 `requestAnimationFrame` 等布局落定，再推进天气、**连续渲染两帧**，然后截图；`AFTER_HINT_MS` 也从 100 ms 提到 700 ms。判断基线是否踩坑的快速办法：看 `tools/shots/baseline/*.png` 的文件大小，正常场景图都在 700 KB 以上，空图只有几十 KB。

---

## 6. 局限

1. **只对「同机同 GPU 同浏览器」有意义。** 跨设备/跨浏览器对比没有参考价值，基准图 `tools/shots/baseline/` 不入库就是这个原因。
2. **是像素占比阈值，不是感知 diff。** 大范围轻微色调变化（如整体曝光偏 1%）可能刚好在阈值内；小范围但显眼的错误（一个标志缺失）反而可能被噪声淹没。门控之外仍要人看总览图。
3. **测的是源码开发入口，不是交付的单文件产物。** `npm run build` 之后建议手动双击 `hainan-middle-school.html` 抽查一次；harness 不覆盖 rollup 内联/字体内联环节。
4. **`?still=1` 冻结动画循环，所以动画本身不被测试。** 入场相机、天气过渡、影片、交互（拖拽/点击/图志卡片）需另做手工或 E2E 检查。
5. **机位矩阵有限（当前 9 个）。** 只覆盖固定视角的静态画面；新增地标/室内/新版块时应补机位。
6. **依赖本机 Chrome。** 找不到时会报错退出（可用 `CHROME_PATH=/path/to/chrome` 指定）；不内置 Chromium。

---

## 7. 日常维护流程

1. 改 `js/`、`css/`、`index.html` 后：`npm run shots`。
2. 有差异 → 看 `tools/shots/diff/<机位>.diff.png` 和 `current/<机位>.png`，判断是预期改动还是回归。
3. 预期改动 → `npm run shots:update` 重建基准 → **再连跑两次 `npm run shots`** 确认确定性（实测多数机位 0 px，spot/移动端偶有 ≤0.05% 的微抖，均应在 0.2% 阈值内；`heavy-rain` 因雨丝相位敏感放宽到 5%）。
4. 升级 Chrome / 换机器后，基准需要整体重建（旧基准可能全部「有差异」）。
5. 提交时只提交脚本与文档改动；`tools/shots/{baseline,current,diff}/` 留在本地。
