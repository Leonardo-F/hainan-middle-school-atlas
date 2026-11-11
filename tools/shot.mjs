/**
 * 视觉回归：按 tools/shots.mjs 的固定机位截图，与基准图逐像素对比。
 *
 *   npm run shots                     # 截图并对比基准；有差异时退出码 1
 *   npm run shots:update              # 用当前画面全部覆盖基准（确认改动符合预期后执行）
 *   node tools/shot.mjs --only=gate --threshold=0.001
 *   node tools/shot.mjs --only=heavy-rain --update
 *   node tools/shot.mjs --extra=env=off      # 给每个 URL 追加参数，做 A/B 对比
 *
 * 目标页面是开发入口 /index.html（由本脚本临时起 HTTP 服务，直接测 js/ 源码，无需 build）。
 * 每个 shot 使用全新的 browser context / page，加载
 *   /index.html?still=1&nointro=1&<shot.query>
 * 等 window.__campusReady === true 与 window.__stillReady === true，再等交互提示的
 * 1.8s CSS 延迟走完（等加载层离场、避免截图时提示时有时无）后截图。
 * ?still=1 由 js/main.js 实现：固定随机种子、冻结时钟、只渲染一帧。
 * 每次截图前还会把天气缓动推进到稳态再重绘一帧（天气按墙钟缓动，冻结帧可能停在过渡中途）。
 *
 * 首次运行没有基准图时，会把本次截图作为基准并提示「已创建基准」，退出码 0。
 * 依赖本机 Chrome（可用 CHROME_PATH 指定）与 devDependencies 里的 playwright-core / pngjs。
 * 原理、加机位、阈值与已知坑见 docs/visual-regression.md。
 */
import http from 'node:http';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { SHOTS } from './shots.mjs';
import { comparePng } from './imagediff.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'tools', 'shots');
const BASE_DIR = path.join(OUT_DIR, 'baseline');
const CUR_DIR = path.join(OUT_DIR, 'current');
const DIFF_DIR = path.join(OUT_DIR, 'diff');

/** 开发入口：与 build 产物 hainan-middle-school.html 分离，避免截图依赖构建结果。 */
const ENTRY = 'index.html';
/** 全局默认阈值：差异像素占比上限。各 shot 可用 tolerance 单独放宽。 */
const DEFAULT_THRESHOLD = 0.002;
/**
 * 交互提示（舞台右下角「拖动旋转 · 滚轮缩放 · 点击建筑」）的 CSS 过渡带
 * 1.8s 延迟：reducedMotion 只把 duration 压到≈0，delay 仍然生效。页面启动
 * 快慢会让 60ms 后的冻结帧相对这个延迟有早有晚，截图时这行小字时有时无。
 * 因此显式等它过渡完成（进入 .is-ready 后的最终状态）再截图。
 */
const HINT_STEADY_OPACITY = 0.8;
const HINT_WAIT_MS = 15000;
/** 提示稳定后再给一帧时间，确保合成器把新 opacity 画进截图。 */
const AFTER_HINT_MS = 700;
/**
 * 天气缓动「稳态」步数：天气过渡（雨/雪/地面积雪/曝光/雾）按墙钟缓动，
 * 只等 __stillReady 时缓动进度取决于页面首帧的快慢，跨运行会差几个百分点。
 * 冻结帧之后通过公开 API 把天气推进 12s 模拟时间（240 × 0.05s）到稳态再重绘一帧，
 * 这一步只发生在 harness 侧，不需要改 js/。见 docs/visual-regression.md §4。
 */
const WEATHER_SETTLE_TICKS = 240;
const WEATHER_SETTLE_STEP = 0.05;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon'
};

/* ------------------------------------------------------------------ */
/*  CLI                                                                */
/* ------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const UPDATE = argv.includes('--update');
const ONLY = valueOf('--only');
const THRESHOLD = parseThreshold(valueOf('--threshold'));
// 追加到每个 URL 末尾的参数，例如 --extra=env=off 做环境反射 A/B 对比。
const EXTRA = valueOf('--extra');

const selected = ONLY ? SHOTS.filter((shot) => shot.name === ONLY) : SHOTS;
if (ONLY && selected.length === 0) {
  console.error(`未知机位：${ONLY}\n可选：${SHOTS.map((shot) => shot.name).join(', ')}`);
  process.exit(2);
}

function valueOf(flag) {
  const prefix = `${flag}=`;
  const found = argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function parseThreshold(raw) {
  if (raw === null || raw === '') return DEFAULT_THRESHOLD;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    console.error(`--threshold 需要 0–1 之间的小数，收到：${raw}`);
    process.exit(2);
  }
  return value;
}

/* ------------------------------------------------------------------ */
/*  Browser & static server                                            */
/* ------------------------------------------------------------------ */

function resolveChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    console.error('找不到 Chrome。请安装 Chrome，或设置 CHROME_PATH=/path/to/chrome。');
    process.exit(2);
  }
  return found;
}

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith('/')) pathname += ENTRY;
      const filePath = path.join(ROOT, pathname);
      if (!filePath.startsWith(ROOT + path.sep)) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
      const body = await readFile(filePath);
      res.writeHead(200, { 'content-type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
}

/**
 * 一个机位一次全新 context：曝光、天气粒子、相机补间等状态不跨 shot 复用。
 * 复用同一 page 会因动画/缓动残留导致第二张图不可重复。
 */
async function capture(browser, baseUrl, shot) {
  const [width, height] = shot.viewport;
  const mobile = width < 600;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    colorScheme: 'light',
    isMobile: mobile,
    hasTouch: mobile
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const suffix = EXTRA ? `&${EXTRA}` : '';
    const url = `${baseUrl}/${ENTRY}?still=1&nointro=1&${shot.query}${suffix}`;
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction('window.__campusReady === true', { timeout: 60000 });
    await page.waitForFunction('window.__stillReady === true', { timeout: 30000 });
    // 等交互提示的 1.8s CSS 延迟走完，避免页面启动快慢导致截图时有时无。
    // spot 机位在打开图志时会 markInteracted()，提示按设计保持隐藏（delay 0s）。
    await page.waitForFunction(
      (minOpacity) => {
        const app = document.getElementById('app');
        const hint = document.getElementById('interactionHint');
        if (!hint || app?.classList.contains('has-interacted')) return true;
        return Number.parseFloat(getComputedStyle(hint).opacity) >= minOpacity;
      },
      HINT_STEADY_OPACITY,
      { timeout: HINT_WAIT_MS }
    );
    await page.waitForTimeout(AFTER_HINT_MS);
    // 天气过渡（雨/雪/地面积雪/曝光/雾）按墙钟缓动，冻结帧可能停在过渡中途，
    // 进度取决于页面启动时的真实耗时。用公开的 weather.tick 把缓动推到稳态
    // （12s 模拟时间），再重绘一帧；纯 harness 侧处理，不需要改 js/。
    await page.evaluate(
      async ({ ticks, step }) => {
        const raf = () => new Promise((resolve) => requestAnimationFrame(resolve));
        // 打开图志面板 / 移动端重排会触发一次 resize→renderer.setSize，把 canvas
        // 清空；冻结动画后必须等布局落定、再补渲染，否则截到空 canvas。
        await document.fonts?.ready?.catch?.(() => {});
        await raf();
        await raf();
        const debug = window.__campusDebug;
        const weather = debug?.weather;
        if (weather && typeof weather.tick === 'function') {
          for (let i = 0; i < ticks; i += 1) weather.tick(step);
        }
        debug?.renderer?.render?.(debug.scene, debug.camera);
        await raf();
        debug?.renderer?.render?.(debug.scene, debug.camera);
        return true;
      },
      { ticks: WEATHER_SETTLE_TICKS, step: WEATHER_SETTLE_STEP }
    );
    const buffer = await page.screenshot({ type: 'png' });
    if (errors.length) console.warn(`  ! ${shot.name}: 控制台有 ${errors.length} 条错误（首条：${errors[0]}）`);
    return buffer;
  } finally {
    await context.close();
  }
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

await mkdir(BASE_DIR, { recursive: true });
await mkdir(CUR_DIR, { recursive: true });
await mkdir(DIFF_DIR, { recursive: true });

const server = createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  executablePath: resolveChrome(),
  headless: true,
  args: ['--no-sandbox', '--disable-crashpad', '--disable-breakpad', '--hide-scrollbars']
});

const results = [];
let created = 0;

try {
  for (const shot of selected) {
    process.stdout.write(`· ${shot.name} ... `);
    const buffer = await capture(browser, baseUrl, shot);
    await writeFile(path.join(CUR_DIR, `${shot.name}.png`), buffer);

    const basePath = path.join(BASE_DIR, `${shot.name}.png`);
    const hadBaseline = existsSync(basePath);

    if (UPDATE) {
      // --update：无条件覆盖基准。已存在的基准先比较一次，方便观察这次改动的幅度。
      if (hadBaseline) {
        const diff = comparePng(await readFile(basePath), buffer);
        if (diff.sizeMismatch) {
          console.log(`尺寸变化 ${diff.baseSize} → ${diff.nextSize}，基准已更新`);
        } else {
          console.log(`旧基准差异 ${diff.diffPixels} px（${(diff.ratio * 100).toFixed(3)}%），基准已更新`);
        }
      } else {
        console.log('已创建基准');
        created += 1;
      }
      await writeFile(basePath, buffer);
      // 旧的 diff 图对应旧基准，--update 后删除以免误读。
      await rm(path.join(DIFF_DIR, `${shot.name}.diff.png`), { force: true });
      results.push({ name: shot.name, status: hadBaseline ? 'baseline-updated' : 'baseline-created' });
      continue;
    }

    if (!hadBaseline) {
      // 首次运行：没有可比较的基准，自动创建并提示。
      await writeFile(basePath, buffer);
      created += 1;
      results.push({ name: shot.name, status: 'baseline-created' });
      console.log('已创建基准');
      continue;
    }

    const diff = comparePng(await readFile(basePath), buffer);
    if (diff.sizeMismatch) {
      results.push({ name: shot.name, status: 'size-mismatch' });
      console.log(`尺寸不一致 ${diff.baseSize} vs ${diff.nextSize}`);
      continue;
    }
    await writeFile(path.join(DIFF_DIR, `${shot.name}.diff.png`), diff.diffBuffer);
    const shotThreshold = Math.max(THRESHOLD, shot.tolerance || 0);
    const ok = diff.ratio <= shotThreshold;
    const pct = `${(diff.ratio * 100).toFixed(3)}%`;
    const limit = `阈值 ${(shotThreshold * 100).toFixed(2)}%`;
    results.push({ name: shot.name, status: ok ? 'ok' : 'changed', ratio: diff.ratio });
    console.log(`${ok ? '一致' : '有差异'}：${diff.diffPixels} px（${pct}，${limit}）`);
  }
} finally {
  await browser.close();
  server.close();
}

const changed = results.filter((r) => r.status === 'changed' || r.status === 'size-mismatch');

console.log('');
if (UPDATE) {
  console.log(`${results.length} 张截图，基准已全部覆盖（--update）。`);
} else {
  console.log(
    `${results.length} 张截图，${changed.length} 张与基准不同（默认阈值 ${(THRESHOLD * 100).toFixed(2)}%，` +
      `机位 tolerance 可放宽）。`
  );
  if (created > 0) {
    console.log(`本次新建了 ${created} 张基准图；再运行一次 npm run shots 即可验证确定性。`);
  }
  if (changed.length) {
    console.log('差异图：tools/shots/diff/；确认改动符合预期后运行 npm run shots:update。');
    process.exitCode = 1;
  }
}
