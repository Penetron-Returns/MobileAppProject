#!/usr/bin/env node
/**
 * Builds the app icon set from the clover character artwork.
 *
 *   node scripts/build-icons.mjs [path/to/clover-source.png]
 *
 * The source defaults to `%TEMP%/brand/clover-source.png`. It is a transparent
 * PNG of the character; swap in a higher-resolution file and re-run, nothing
 * else changes. Outputs go to `src/assets/images/` and the chosen colours are
 * printed so `app.json` (adaptive icon and splash backgrounds) can match.
 *
 * Uses `jimp-compact`, which Expo already ships (it is a dependency of
 * `@expo/image-utils`), so nothing is added to package.json.
 */
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Jimp = require('jimp-compact');

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../src/assets/images');
const sourcePath =
  process.argv[2] ?? path.join(tmpdir(), 'brand', 'clover-source.png');

const SIZE = 1024;
/** Share of the icon width the clover covers, per output. */
const ICON_SCALE = 0.72;
const ADAPTIVE_SCALE = 0.6; // inside the Android 66% safe circle
const SPLASH_SIZE = 512;
const FAVICON_SIZE = 48;

const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
const mix = (a, b, t) => a.map((c, i) => clamp(c + (b[i] - c) * t));
const hex = (rgb) =>
  `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;

/** Average colour of the clearly opaque pixels: the character's blue. */
function dominantColour(image) {
  const { data, width, height } = image.bitmap;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < width * height * 4; i += 4) {
    if (data[i + 3] > 200) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n += 1;
    }
  }
  if (n === 0) throw new Error('The source has no opaque pixels.');
  return [r / n, g / n, b / n].map(clamp);
}

/** Crop to the visible pixels so "72% wide" means the character, not the canvas. */
function cropToContent(image) {
  const { data, width, height } = image.bitmap;
  let [x0, y0, x1, y1] = [width, height, -1, -1];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
  }
  if (x1 < 0) throw new Error('The source is fully transparent.');
  return image.clone().crop(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}

/** The character scaled to `width` wide, centred on a transparent square. */
function onSquare(character, square, widthShare) {
  const canvas = new Jimp(square, square, 0x00000000);
  const w = Math.round(square * widthShare);
  const scaled = character
    .clone()
    .resize(
      w,
      Math.round((w * character.bitmap.height) / character.bitmap.width),
    );
  canvas.composite(
    scaled,
    Math.round((square - scaled.bitmap.width) / 2),
    Math.round((square - scaled.bitmap.height) / 2),
  );
  return canvas;
}

/** The character as large as fits a transparent square (longest side = the square). */
function fitSquare(character, square) {
  const { width, height } = character.bitmap;
  return onSquare(character, square, width >= height ? 1 : width / height);
}

/** Vertical gradient `top` to `bottom`, fully opaque. */
function gradient(size, top, bottom) {
  const canvas = new Jimp(size, size, 0xffffffff);
  for (let y = 0; y < size; y += 1) {
    const [r, g, b] = mix(top, bottom, y / (size - 1));
    const colour = Jimp.rgbaToInt(r, g, b, 255);
    for (let x = 0; x < size; x += 1) canvas.setPixelColor(colour, x, y);
  }
  return canvas;
}

/** White where the artwork is, keeping its alpha (Android themed icons). */
function silhouette(image) {
  const out = image.clone();
  out.scan(0, 0, out.bitmap.width, out.bitmap.height, (x, y, idx) => {
    out.bitmap.data[idx] = 255;
    out.bitmap.data[idx + 1] = 255;
    out.bitmap.data[idx + 2] = 255;
  });
  return out;
}

const save = async (image, name) => {
  const file = path.join(outDir, name);
  await image.writeAsync(file);
  console.log(`${name}  ${image.bitmap.width}x${image.bitmap.height}`);
};

const character = cropToContent(await Jimp.read(sourcePath));
const blue = dominantColour(character);

// Light sky (the blue washed 80% toward white) fading to white; the dark
// splash is the same hue taken 88% toward black.
const sky = mix(blue, [255, 255, 255], 0.8);
const WHITE = [255, 255, 255];
const night = mix(blue, [0, 0, 0], 0.88);

// Icons must be opaque, so the character goes over the gradient.
await save(
  gradient(SIZE, sky, WHITE).composite(
    onSquare(character, SIZE, ICON_SCALE),
    0,
    0,
  ),
  'icon.png',
);
await save(onSquare(character, SIZE, ADAPTIVE_SCALE), 'adaptive-icon.png');
await save(
  silhouette(onSquare(character, SIZE, ADAPTIVE_SCALE)),
  'adaptive-icon-monochrome.png',
);
await save(fitSquare(character, SPLASH_SIZE), 'splash-icon.png');
await save(fitSquare(character, FAVICON_SIZE), 'favicon.png');

console.log(`\ndominant blue   ${hex(blue)}`);
console.log(`light background ${hex(sky)} -> #ffffff (icon gradient)`);
console.log(`dark splash      ${hex(night)}`);
