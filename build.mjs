/**
 * Build a fully self-contained 海南中学府城校区 page.
 * - bundles ES modules + Three.js into one IIFE
 * - inlines local WOFF2 fonts and CSS
 * - works when opened directly via file://
 */
import { rollup } from 'rollup';
import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const resolve = (...parts) => path.join(root, ...parts);
const read = (file) => readFile(resolve(file), 'utf8');

const bundle = await rollup({
  input: resolve('js/main.js'),
  onwarn(warning, warn) {
    if (warning.code === 'THIS_IS_UNDEFINED') return;
    if (warning.code === 'CIRCULAR_DEPENDENCY') return;
    warn(warning);
  },
  plugins: [
    {
      name: 'local-three',
      resolveId(source) {
        if (source === 'three') return resolve('vendor/three.module.js');
        if (source === 'three/addons/OrbitControls.js') return resolve('vendor/OrbitControls.js');
        return null;
      }
    }
  ]
});

const { output } = await bundle.generate({
  format: 'iife',
  name: 'FuchengCampusAtlas',
  sourcemap: false,
  compact: false,
  generatedCode: 'es2015'
});
await bundle.close();

let js = output[0].code
  .replace(/<\/script/gi, '<\\/script')
  .replace(/<!--/g, '<\\!--');

// Inline the landmark photographs so the single-file build works over file://.
const photoPattern = /assets\/photos\/([A-Za-z0-9_.-]+\.(?:jpg|jpeg|png|webp))/g;
const photoNames = [...new Set([...js.matchAll(photoPattern)].map((match) => match[1]))];
for (const name of photoNames) {
  const bytes = await readFile(resolve('assets/photos', name));
  const mime = name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  const dataUri = `data:${mime};base64,${bytes.toString('base64')}`;
  js = js.replaceAll(`assets/photos/${name}`, dataUri);
}
if (js.includes('assets/photos/')) {
  throw new Error('Build failed to inline every landmark photograph.');
}

let css = await read('css/style.css');
const fontPattern = /url\(['"]?\.\.\/assets\/fonts\/([^'"?]+\.woff2)['"]?\)/g;
const fontNames = [...new Set([...css.matchAll(fontPattern)].map((match) => match[1]))];
for (const name of fontNames) {
  const bytes = await readFile(resolve('assets/fonts', name));
  const dataUri = `url("data:font/woff2;base64,${bytes.toString('base64')}")`;
  css = css.replaceAll(`url('../assets/fonts/${name}')`, dataUri);
  css = css.replaceAll(`url("../assets/fonts/${name}")`, dataUri);
}

let html = await read('index.html');
html = html
  .replace(/^\s*<link rel="preload"[^>]+>\s*$/gm, '')
  .replace(/^\s*<link rel="stylesheet" href="css\/style\.css">\s*$/m, '')
  .replace(/^\s*<script type="importmap">[\s\S]*?<\/script>\s*$/m, '')
  .replace(/^\s*<script type="module" src="\.\/js\/main\.js"><\/script>\s*$/m, '');

if (html.includes('css/style.css') || html.includes('js/main.js')) {
  throw new Error('Build failed to remove development asset references.');
}
if (css.includes('</style')) throw new Error('CSS contains a closing style tag.');
if (js.includes('</script')) throw new Error('JS contains a closing script tag.');

const styleTag = `<style id="fucheng-styles">\n${css}\n</style>`;
const scriptTag = `<script id="fucheng-app">\n${js}\n</script>`;
html = html.replace('</head>', () => `  <!-- Self-contained atlas build: fonts, CSS and application code are inlined. -->\n  ${styleTag}\n</head>`);
html = html.replace('</body>', () => `  ${scriptTag}\n</body>`);

const outPath = resolve('hainan-middle-school.html');
await writeFile(outPath, html, 'utf8');
const size = (await stat(outPath)).size;
console.log(`Wrote ${path.relative(process.cwd(), outPath)} (${(size / 1024).toFixed(0)} kB, ${fontNames.length} fonts, ${photoNames.length} photos inlined)`);
