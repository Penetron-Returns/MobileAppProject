// Regenerates the calendar off-hours stripe tiles (assets/images/hatch/*.png).
// Reproduces the original SVG pattern: 8px perpendicular period, 2px stripe,
// "/" direction (rotate(45)), label colour at 0.07 (light, black) / 0.10 (dark,
// white). 8*sqrt(2) = 11.31px is not an integer, so the tile is 34px with
// exactly 3 stripes (period 11.33px, 0.17% off) to wrap seamlessly on every edge.
// Run: node apps/mobile/scripts/build-hatch-tiles.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../assets/images/hatch',
);
const BASE = 34; // px at @1x
const STRIPES = 3;
const STRIPE_PERP = 2; // stroke width, perpendicular to the stripe
const SS = 8; // supersampling per axis
const SCHEMES = {
  light: { rgb: [0, 0, 0], alpha: 0.07 },
  dark: { rgb: [255, 255, 255], alpha: 0.1 },
};

function render(scale, { rgb, alpha }) {
  const size = BASE * scale;
  const period = size / STRIPES; // spacing of x+y between stripe centres
  const half = (STRIPE_PERP * scale * Math.SQRT2) / 2; // half-width in x+y units
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hit = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const s = x + (sx + 0.5) / SS + y + (sy + 0.5) / SS;
          const m = ((s % period) + period) % period;
          if (Math.min(m, period - m) <= half) hit++;
        }
      }
      const i = (y * size + x) * 4;
      png.data[i] = rgb[0];
      png.data[i + 1] = rgb[1];
      png.data[i + 2] = rgb[2];
      png.data[i + 3] = Math.round((hit / (SS * SS)) * alpha * 255);
    }
  }
  return PNG.sync.write(png);
}

mkdirSync(OUT, { recursive: true });
for (const [name, spec] of Object.entries(SCHEMES)) {
  for (const scale of [1, 2, 3]) {
    const file = `hatch-${name}${scale === 1 ? '' : `@${scale}x`}.png`;
    writeFileSync(join(OUT, file), render(scale, spec));
  }
}
console.log('wrote hatch tiles to', OUT);
