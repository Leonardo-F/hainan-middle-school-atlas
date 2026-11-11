/**
 * 逐像素对比两张同尺寸 PNG（视觉回归门控）。
 * 用法：node tools/imagediff.mjs <baseline.png> <current.png> [--threshold 0.002]
 * 输出：diffPixels / ratio / diff 图路径；ratio 超过阈值时退出码 1。
 */
import { readFile, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';

/**
 * @param {Buffer} baseBuf
 * @param {Buffer} nextBuf
 * @param {{ channelTolerance?: number }} [options] 单通道差值小于该值视为相同（抗 GPU/编码抖动）
 */
export function comparePng(baseBuf, nextBuf, { channelTolerance = 6 } = {}) {
  const base = PNG.sync.read(baseBuf);
  const next = PNG.sync.read(nextBuf);
  if (base.width !== next.width || base.height !== next.height) {
    return {
      sizeMismatch: true,
      baseSize: [base.width, base.height],
      nextSize: [next.width, next.height]
    };
  }
  const { width, height } = base;
  const diff = new PNG({ width, height });
  let diffPixels = 0;
  for (let i = 0; i < base.data.length; i += 4) {
    const dr = Math.abs(base.data[i] - next.data[i]);
    const dg = Math.abs(base.data[i + 1] - next.data[i + 1]);
    const db = Math.abs(base.data[i + 2] - next.data[i + 2]);
    if (Math.max(dr, dg, db) > channelTolerance) {
      diffPixels += 1;
      diff.data[i] = 255;
      diff.data[i + 1] = 30;
      diff.data[i + 2] = 30;
      diff.data[i + 3] = 255;
    } else {
      const g = Math.round((base.data[i] + base.data[i + 1] + base.data[i + 2]) / 3 * 0.32);
      diff.data[i] = g;
      diff.data[i + 1] = g;
      diff.data[i + 2] = g;
      diff.data[i + 3] = 255;
    }
  }
  return {
    width,
    height,
    diffPixels,
    ratio: diffPixels / (width * height),
    diffBuffer: PNG.sync.write(diff)
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [basePath, nextPath] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const thresholdArg = process.argv.find((arg) => arg.startsWith('--threshold='));
  const threshold = thresholdArg ? Number(thresholdArg.split('=')[1]) : 0.002;
  if (!basePath || !nextPath) {
    console.error('用法: node tools/imagediff.mjs <baseline.png> <current.png> [--threshold=0.002]');
    process.exit(2);
  }
  const result = comparePng(await readFile(basePath), await readFile(nextPath));
  if (result.sizeMismatch) {
    console.error(`尺寸不一致: ${result.baseSize} vs ${result.nextSize}`);
    process.exit(1);
  }
  const out = nextPath.replace(/\.png$/, '.diff.png');
  await writeFile(out, result.diffBuffer);
  console.log(`${result.diffPixels} px (${(result.ratio * 100).toFixed(3)}%) 不同；diff → ${out}`);
  process.exit(result.ratio > threshold ? 1 : 0);
}
