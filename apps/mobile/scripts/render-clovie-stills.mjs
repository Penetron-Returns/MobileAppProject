#!/usr/bin/env node
/**
 * Renders hi-res stills of Clovie (bot-avatars clover, default pose, fabric,
 * paused) on a transparent background, for icons and branding.
 *
 *   node scripts/render-clovie-stills.mjs [outDir]
 *
 * Pass `--tilt` to hold a slight 3D turn (yaw 0.22 rad ~12.6deg, roll -0.06 rad)
 * and write clovie-tilt-<size>.png instead; used for the app icon.
 *
 * Needs `playwright-core` (not a project dependency: install it somewhere and
 * point PLAYWRIGHT_CORE at its folder, or install it ad hoc) and a Chromium
 * from `npx playwright install chromium`. Writes clovie-1024.png and
 * clovie-2048.png to outDir (default `%TEMP%/brand`). Each is the avatar's
 * canvas, which draws 1.5x its box, so the character sits centred with margin.
 */
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const tilt = args.includes('--tilt');
const outDir =
  args.find((a) => !a.startsWith('--')) ?? path.join(tmpdir(), 'brand');
/** Radians: turned to the viewer's right and leaning a touch, so he reads as 3D. */
const TILT_POSE = { yaw: 0.22, pitch: 0, roll: -0.06 };
const require = createRequire(
  path.join(process.env.PLAYWRIGHT_CORE ?? here, 'noop.js'),
);
const { chromium } = require('playwright-core');

const bundle = (
  await build({
    entryPoints: [path.join(here, 'clovie-embed-entry.mjs')],
    bundle: true,
    write: false,
    minify: true,
    format: 'iife',
    target: 'es2020',
    charset: 'ascii',
    define: { 'process.env.NODE_ENV': '"production"' },
    nodePaths: [path.resolve(here, '../../../node_modules')],
  })
).outputFiles[0].text.replace(/<\/script/gi, '<\/script');

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
});
for (const size of [1024, 2048]) {
  const page = await browser.newPage({
    viewport: { width: size * 2, height: size * 2 },
  });
  const config = JSON.stringify({
    state: 'default',
    size: `${size}px`,
    paused: true,
    pose: tilt ? TILT_POSE : undefined,
  });
  await page.setContent(
    `<!doctype html><body style="margin:0;background:transparent;display:flex;align-items:center;justify-content:center;height:100vh"><div id="root"></div><script>window.__CLOVIE__=${config}</script><script>${bundle}</script></body>`,
  );
  await page.waitForSelector('canvas');
  // The fur pile bakes on idle time; a paused avatar redraws once it lands.
  await page.waitForTimeout(6000);
  const file = path.join(
    outDir,
    tilt ? `clovie-tilt-${size}.png` : `clovie-${size}.png`,
  );
  await page.locator('canvas').screenshot({ path: file, omitBackground: true });
  console.log('wrote', file);
  await page.close();
}
await browser.close();
