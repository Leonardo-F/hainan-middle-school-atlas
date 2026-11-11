/**
 * 固定机位清单（视觉回归用）。
 * tools/shot.mjs 会以 `/index.html?still=1&nointro=1&<query>` 加载开发入口
 * （临时 HTTP 服务，测 js/ 源码，无需 build），冻结时钟后截一张图；
 * 同一机位、同一机器的截图应逐像素一致。
 *
 * 可用参数（见 js/main.js 与 js/weather.js）：
 *   hour=6..20.8        日照时刻
 *   view=top            俯瞰
 *   spot=<landmark id>  打开某处地景的图志（gate/fengqi/yanlin/hall1/library/...）
 *   weather=clear|light-rain|heavy-rain|typhoon|thunder|snow
 *   campus=fucheng      校区
 *
 * tolerance：该机位的差异像素占比上限（与全局 --threshold 取较大值）。
 *   仅用于无法完全冻结的动画，例如 heavy-rain 的雨丝依赖粒子时间；实测抖动
 *   在 0.2% 以内，但仍保留 1.5% 作为安全余量。
 * 天气缓动（地面积雪/曝光/雾等）由 tools/shot.mjs 在截图前统一推进到稳态，
 * 因此下雨/下雪机位不需要额外配置。见 docs/visual-regression.md §4。
 * 加机位：复制一行，保证 name 唯一、query 只含确定性参数即可。
 */
export const SHOTS = [
  { name: 'overview-noon', viewport: [1440, 900], query: 'hour=10' },
  { name: 'overview-golden', viewport: [1440, 900], query: 'hour=17.4' },
  { name: 'top-night', viewport: [1440, 900], query: 'view=top&hour=19.8' },
  { name: 'gate', viewport: [1440, 900], query: 'spot=gate&hour=10' },
  { name: 'fengqi', viewport: [1440, 900], query: 'spot=fengqi&hour=16' },
  { name: 'library', viewport: [1440, 900], query: 'spot=library&hour=16' },
  // 雨丝/雪粒 shader 由时间驱动；具体差异由 per-shot tolerance 兜底。
  {
    name: 'heavy-rain',
    viewport: [1440, 900],
    query: 'hour=16&weather=heavy-rain',
    tolerance: 0.05
  },
  { name: 'snow', viewport: [1440, 900], query: 'hour=10&weather=snow' },
  { name: 'mobile', viewport: [390, 844], query: 'hour=16', tolerance: 0.008 }
];
