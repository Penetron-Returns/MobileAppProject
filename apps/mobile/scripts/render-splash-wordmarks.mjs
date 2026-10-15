#!/usr/bin/env node
/**
 * Renders the native launch splash wordmarks (light: Deep, dark: white), using
 * the same geometry as `ClovieWordmark.tsx`: "Clov" + dotless i + "e" tracked
 * -0.05em, with a five-circle Clovie Blue clover (0.3em) 0.05em above the stem.
 *
 *   node scripts/render-splash-wordmarks.mjs [previewDir]
 *
 * Output is a transparent 1024px square per scheme in `src/assets/images/`.
 * The wordmark's ink box is sized so its corners sit inside the circle that
 * Android 12+ masks the splash icon to (diameter = 2/3 of the canvas), with a
 * small margin, so nothing is clipped. Same Playwright setup as
 * render-clovie-stills.mjs (PLAYWRIGHT_CORE, CHROMIUM_PATH).
 *
 * Font: Inter Bold (from expo-dev-menu's bundled copy) thickened with a thin
 * stroke to stand in for ExtraBold 800, which is not shipped anywhere here.
 */
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const outDir = path.resolve(here, '../src/assets/images');
const previewDir = process.argv[2];
const require = createRequire(
  path.join(process.env.PLAYWRIGHT_CORE ?? here, 'noop.js'),
);
const { chromium } = require('playwright-core');

const CANVAS = 1024;
/** Android 12+ circle diameter as a share of the splash canvas. */
const CIRCLE = 2 / 3;
/** Keep the ink box's corners this far inside that circle. */
const MARGIN = 0.94;
const VARIANTS = [
  { file: 'splash-wordmark.png', ink: '#0A4E75' },
  { file: 'splash-wordmark-dark.png', ink: '#FFFFFF' },
];
const BLUE = '#2AA1D6';
const PETALS = [
  [12, 6.3, 5.7],
  [12, 17.7, 5.7],
  [6.3, 12, 5.7],
  [17.7, 12, 5.7],
  [12, 12, 5],
];
const fontFile = path.join(
  root,
  'node_modules/expo-dev-menu/android/src/debug/res/font/inter_bold.ttf',
);
const fontData = (await readFile(fontFile)).toString('base64');

function html(ink) {
  const circles = PETALS.map(
    ([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${BLUE}"/>`,
  ).join('');
  return `<!doctype html><style>
@font-face{font-family:W;src:url(data:font/ttf;base64,${fontData});font-weight:700}
html,body{margin:0;background:transparent}
#w{position:absolute;left:0;top:0;font:700 100px/1 W,'Segoe UI Black',sans-serif;
  color:${ink};-webkit-text-stroke:0.006em ${ink};letter-spacing:-0.05em;white-space:nowrap}
#i{position:relative}
#t{position:absolute;width:0.3em;height:0.3em}
</style><div id="w">Clov<span id="i">&#x131;<svg id="t" viewBox="0 0 24 24">${circles}</svg></span>e</div>`;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
});
await mkdir(outDir, { recursive: true });
if (previewDir) await mkdir(previewDir, { recursive: true });
for (const { file, ink } of VARIANTS) {
  const page = await browser.newPage({
    viewport: { width: CANVAS, height: CANVAS },
  });
  await page.setContent(html(ink));
  await page.evaluate(() => document.fonts.ready);
  // Place the clover from the measured glyph, as ClovieWordmark does, then
  // scale and centre the ink box (clover top to baseline, C to e) on the canvas.
  const box = await page.evaluate(
    ({ canvas, circle, margin }) => {
      const em = 100;
      const w = document.getElementById('w');
      const i = document.getElementById('i');
      const t = document.getElementById('t');
      const probe = document.createElement('canvas').getContext('2d');
      probe.font = `700 ${em}px W`;
      const xHeight = probe.measureText('x').actualBoundingBoxAscent;
      const marker = document.createElement('span');
      marker.style.cssText = 'display:inline-block;width:0;height:0';
      w.appendChild(marker);
      const baseline = marker.getBoundingClientRect().bottom;
      const stemTop = baseline - xHeight;
      const tracking = -0.05 * em;
      const ir = i.getBoundingClientRect();
      const centre = ir.width / 2 - tracking / 2;
      const size = 0.3 * em;
      t.style.left = `${centre - size / 2}px`;
      t.style.top = `${stemTop - 0.05 * em - size - ir.top}px`;
      const wr = w.getBoundingClientRect();
      const ink = {
        left: wr.left,
        right: wr.right,
        top: stemTop - 0.05 * em - size,
        bottom: baseline,
      };
      const iw = ink.right - ink.left;
      const ih = ink.bottom - ink.top;
      const diagonal = Math.hypot(iw, ih);
      const scale = (canvas * circle * margin) / diagonal;
      const tx = canvas / 2 - ((ink.left + ink.right) / 2) * scale;
      const ty = canvas / 2 - ((ink.top + ink.bottom) / 2) * scale;
      w.style.transformOrigin = '0 0';
      w.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
      return { iw: iw * scale, ih: ih * scale, scale };
    },
    { canvas: CANVAS, circle: CIRCLE, margin: MARGIN },
  );
  const target = path.join(outDir, file);
  await page.screenshot({ path: target, omitBackground: true });
  console.log(
    `${file}  ink ${Math.round(box.iw)}x${Math.round(box.ih)} in ${CANVAS}px (circle ${Math.round(CANVAS * CIRCLE)}px)`,
  );
  if (previewDir) await copyFile(target, path.join(previewDir, file));
  await page.close();
}
await browser.close();
