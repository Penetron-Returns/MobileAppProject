#!/usr/bin/env node
/**
 * Renders the companion offline into the PNG sprites the story viewer uses
 * instead of a live WebView: blink frames, a small
 * neutral still, a baked ground shadow and one blurred glow per story tone.
 *
 *   PLAYWRIGHT_CORE=<folder containing node_modules/playwright-core> \
 *   CHROMIUM_PATH=<chrome/edge/chromium executable> \
 *   node scripts/clovie/render-sprites.mjs [outDir]
 *
 * Like render-clovie-stills.mjs, `playwright-core` is not a project
 * dependency. The avatar is the same `BotAvatar` the live WebView draws (clover,
 * fabric, paused). Its `pose` prop only takes yaw, pitch and roll, so the
 * library's resting pose gets one patched field, `window.__BLINK`, read as the
 * eye closure (the live blink is `sin(pi * p)`, 0 open to 1 shut). A frame is
 * then exactly what the live canvas shows at that point of a blink.
 * Output (default `src/assets/images/clovie/`) is committed; rerun after
 * upgrading `bot-avatars` or changing the tones.
 */
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir =
  process.argv.slice(2).find((a) => !a.startsWith('--')) ??
  path.resolve(here, '../../src/assets/images/clovie');
const require = createRequire(
  path.join(process.env.PLAYWRIGHT_CORE ?? here, 'noop.js'),
);
const { chromium } = require('playwright-core');

/** Display size 84 pt at up to 1.05 scale on a 3x screen is ~265 px; 288 covers it. */
const MAIN_PX = 288;
const SMALL_PX = 128;
/** Eye closure per frame of a blink (the library's blink is sin(pi * p)): open, half, closed. */
const CLOSURES = { open: 0, half: 0.5, closed: 1 };
/** The paused 'working' pose renders byte-identical to 'default' (the hop and laugh are motion), so one set serves both. */
const STATES = ['default'];

/** Mirrors TONES in src/features/stories/tones.ts (glow1, glow2, glowAlpha). */
const TONES = {
  positive: ['47,191,149', '94,207,201', 0.36],
  neutral: ['42,161,214', '94,207,201', 0.5],
  attention: ['255,159,10', '255,196,102', 0.34],
  concern: ['255,122,110', '255,170,160', 0.32],
};
/** Reference screen the glow is drawn for; the PNG is stretched to the real one. */
const GLOW_W = 402;
const GLOW_H = 874;
const GLOW_SCALE = 0.5;

const REST_BLINK = /blinkL: 0,\s*blinkR: 0,/;
/** Makes the library's resting pose read its eye closure from `window.__BLINK`. */
const blinkPatch = {
  name: 'blink-patch',
  setup(b) {
    b.onLoad(
      { filter: /bot-avatars[\\/]dist[\\/]index\.es\.js$/ },
      async (args) => {
        const src = await readFile(args.path, 'utf8');
        if (!REST_BLINK.test(src))
          throw new Error('bot-avatars changed: rest pose not found');
        return {
          contents: src.replace(
            REST_BLINK,
            'blinkL: window.__BLINK || 0, blinkR: window.__BLINK || 0,',
          ),
          loader: 'js',
        };
      },
    );
  },
};

const entry = `
import { BotAvatar } from 'bot-avatars';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
const root = createRoot(document.getElementById('root'));
window.__render = (props) =>
  root.render(React.createElement(BotAvatar, {
    type: 'clover', shading: 'fabric', paused: true, 'aria-hidden': 'true',
    style: { pointerEvents: 'none' }, ...props,
  }));
`;
const bundle = (
  await build({
    stdin: {
      contents: entry,
      resolveDir: path.resolve(here, '../..'),
      loader: 'js',
    },
    bundle: true,
    write: false,
    minify: true,
    format: 'iife',
    target: 'es2020',
    charset: 'ascii',
    define: { 'process.env.NODE_ENV': '"production"' },
    nodePaths: [path.resolve(here, '../../../../node_modules')],
    plugins: [blinkPatch],
  })
).outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 3200, height: 3200 } });
await page.setContent(
  `<!doctype html><body style="margin:0;background:transparent"><div id="root"></div><script>${bundle}</script></body>`,
);

const frames = {};
for (const state of STATES) {
  for (const [name, closure] of Object.entries(CLOSURES)) {
    await page.evaluate(
      ([s, c]) => {
        window.__BLINK = c;
        window.__render({ size: '1024px', state: s, key: s + c });
      },
      [state, closure],
    );
    await page.waitForSelector('canvas');
    // The fur pile bakes on idle time; a paused avatar redraws once it lands.
    await page.waitForTimeout(
      state === 'default' && name === 'open' ? 6000 : 1500,
    );
    const buffer = await page
      .locator('canvas')
      .screenshot({ omitBackground: true });
    frames[`${state}-${name}`] = buffer.toString('base64');
  }
}

/** In the page: trim to the open frame's body, pad to a square, resample down. */
const encoded = await page.evaluate(
  async ({ frames, mainPx, smallPx, tones, glow }) => {
    const load = (b64) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = `data:image/png;base64,${b64}`;
      });
    const imgs = {};
    for (const k of Object.keys(frames)) imgs[k] = await load(frames[k]);
    const ref = imgs['default-open'];
    const probe = document.createElement('canvas');
    probe.width = ref.width;
    probe.height = ref.height;
    const pctx = probe.getContext('2d');
    pctx.drawImage(ref, 0, 0);
    const { data, width, height } = pctx.getImageData(
      0,
      0,
      ref.width,
      ref.height,
    );
    let x0 = width;
    let y0 = height;
    let x1 = 0;
    let y1 = 0;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (data[(y * width + x) * 4 + 3] > 12) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    const side = Math.max(bw, bh);
    const ox = x0 - (side - bw) / 2;
    const oy = y0 - (side - bh) / 2;
    const out = { bbox: `${bw}x${bh} of ${width}x${height}` };
    const shrink = (img, px) => {
      // Halve repeatedly, then a final resample: avoids the shimmer of one big jump.
      let src = document.createElement('canvas');
      src.width = side;
      src.height = side;
      src.getContext('2d').drawImage(img, ox, oy, side, side, 0, 0, side, side);
      let w = side;
      while (w / 2 >= px) {
        const next = document.createElement('canvas');
        next.width = next.height = Math.round(w / 2);
        const c = next.getContext('2d');
        c.imageSmoothingQuality = 'high';
        c.drawImage(src, 0, 0, next.width, next.height);
        src = next;
        w = next.width;
      }
      const dst = document.createElement('canvas');
      dst.width = dst.height = px;
      const dctx = dst.getContext('2d');
      dctx.imageSmoothingQuality = 'high';
      dctx.drawImage(src, 0, 0, px, px);
      return dst.toDataURL('image/png').split(',')[1];
    };
    for (const k of Object.keys(imgs))
      out[`${k}-${mainPx}`] = shrink(imgs[k], mainPx);
    out[`neutral-${smallPx}`] = shrink(imgs['default-open'], smallPx);

    // Ground shadow: the 56x8 pt pill (35% black, blur 3) inside a 72x20 pt box, at 3x.
    const sh = document.createElement('canvas');
    sh.width = 72 * 3;
    sh.height = 20 * 3;
    const sctx = sh.getContext('2d');
    sctx.filter = 'blur(9px)';
    sctx.fillStyle = 'rgba(0,0,0,0.35)';
    sctx.beginPath();
    sctx.roundRect(8 * 3, 6 * 3, 56 * 3, 8 * 3, 28 * 3);
    sctx.fill();
    out['shadow'] = sh.toDataURL('image/png').split(',')[1];

    // Tone glows: the two radial gradients of ToneGlow, drawn once at half scale.
    for (const [tone, [c1, c2, a]] of Object.entries(tones)) {
      const g = document.createElement('canvas');
      g.width = Math.round(glow.w * glow.s);
      g.height = Math.round(glow.h * glow.s);
      const ctx = g.getContext('2d');
      ctx.scale(glow.s, glow.s);
      const paint = (cx, cy, r, rgb, alpha) => {
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, `rgba(${rgb},${alpha})`);
        grad.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, glow.w, glow.h);
      };
      paint(glow.w * 0.06, glow.h * 0.06 * 0.9, 340, c1, a);
      paint(
        glow.w * 0.92,
        glow.h * 0.88,
        300,
        c2,
        Number((a * 0.6).toFixed(2)),
      );
      out[`glow-${tone}`] = g.toDataURL('image/png').split(',')[1];
    }
    return out;
  },
  {
    frames,
    mainPx: MAIN_PX,
    smallPx: SMALL_PX,
    tones: TONES,
    glow: { w: GLOW_W, h: GLOW_H, s: GLOW_SCALE },
  },
);

console.log('body bbox', encoded.bbox);
delete encoded.bbox;
for (const [name, b64] of Object.entries(encoded)) {
  const file = path.join(outDir, `${name}.png`);
  await writeFile(file, Buffer.from(b64, 'base64'));
  console.log('wrote', file);
}
await browser.close();
