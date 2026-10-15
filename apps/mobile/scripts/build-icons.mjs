#!/usr/bin/env node
/**
 * Builds the app icon set from the clover character artwork.
 *
 *   node scripts/build-icons.mjs [path/to/clover-source.png] [--preview dir]
 *
 * The source defaults to `%TEMP%/brand/clovie-tilt-2048.png`, the slightly
 * turned (3D) still from `render-clovie-stills.mjs --tilt`; transparent
 * background. Outputs go to `src/assets/images/`, and `--preview dir` also
 * copies them (plus mask previews) there for eyeballing.
 *
 * Platform rules:
 * - iOS `icon.png`: 1024x1024, opaque, square (the OS rounds it). The
 *   character's longest side is ICON_FILL of the canvas, optically centred.
 * - Android adaptive: the 1024px foreground stands for 108dp; launchers mask
 *   to at most a 66dp circle (61.1%), so every opaque pixel is scaled to sit
 *   inside that circle. The background is the solid colour in `app.json`
 *   (BACKGROUND below). The monochrome layer is the same placement, a white
 *   silhouette with the eyes cut out so it still reads as Clovie.
 *
 * Uses `jimp-compact`, which Expo already ships (it is a dependency of
 * `@expo/image-utils`), so nothing is added to package.json.
 */
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Jimp = require('jimp-compact');

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../src/assets/images');
const args = process.argv.slice(2);
const previewAt = args.indexOf('--preview');
const previewDir = previewAt >= 0 ? args[previewAt + 1] : undefined;
const sourcePath =
  args.find((a, i) => !a.startsWith('--') && i !== previewAt + 1) ??
  path.join(tmpdir(), 'brand', 'clovie-tilt-2048.png');

const SIZE = 1024;
/** iOS: the longest side of the character as a share of the canvas (70-80% is the norm). */
const ICON_FILL = 0.74;
/** Android adaptive: launchers mask to at most a 66dp circle of the 108dp canvas. */
const ADAPTIVE_SAFE_DIAMETER = 66 / 108;
/** Fur wisps are faint; leave 2% so a mask never nicks them. */
const ADAPTIVE_HEADROOM = 0.98;
const FAVICON_SIZE = 48;
/** Adaptive background; must match `android.adaptiveIcon.backgroundColor` in app.json. */
const BACKGROUND = [0xd4, 0xe9, 0xf4];

const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
const mix = (a, b, t) => a.map((c, i) => clamp(c + (b[i] - c) * t));
const WHITE = [255, 255, 255];
const hex = (rgb) =>
  `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;

/** Crop to the visible pixels so sizes refer to the character, not the canvas. */
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

/**
 * The optical centre: the mean of the bounding-box centre and the alpha-weighted
 * centre of mass, so a lobed, tilted shape does not look off-centre.
 */
function opticalCentre(image) {
  const { data, width, height } = image.bitmap;
  let [sx, sy, sum] = [0, 0, 0];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = data[(y * width + x) * 4 + 3];
      sx += x * a;
      sy += y * a;
      sum += a;
    }
  }
  return [(width / 2 + sx / sum) / 2, (height / 2 + sy / sum) / 2];
}

/** Largest distance from (cx, cy) to any visibly opaque pixel. */
function maxRadius(image, [cx, cy]) {
  const { data, width, height } = image.bitmap;
  let max = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        max = Math.max(max, Math.hypot(x - cx, y - cy));
      }
    }
  }
  return max;
}

/** The character scaled by `factor`, optical centre on the middle of a transparent square. */
function placeOnSquare(character, square, factor) {
  const { width, height } = character.bitmap;
  const [ox, oy] = opticalCentre(character);
  const scaled = character
    .clone()
    .resize(Math.round(width * factor), Math.round(height * factor));
  const canvas = new Jimp(square, square, 0x00000000);
  canvas.composite(
    scaled,
    Math.round(square / 2 - ox * factor),
    Math.round(square / 2 - oy * factor),
  );
  return canvas;
}

/** Longest side of the character = `share` of the square. */
function fillSquare(character, square, share) {
  const { width, height } = character.bitmap;
  return placeOnSquare(
    character,
    square,
    (square * share) / Math.max(width, height),
  );
}

/** Every visible pixel inside the circle of `diameterShare` of the square. */
function fitInCircle(character, square, diameterShare) {
  const radius = maxRadius(character, opticalCentre(character));
  return placeOnSquare(
    character,
    square,
    (square * diameterShare) / 2 / radius,
  );
}

/** Opaque vertical gradient `top` to `bottom`. */
function gradient(size, top, bottom) {
  const canvas = new Jimp(size, size, 0xffffffff);
  for (let y = 0; y < size; y += 1) {
    const [r, g, b] = mix(top, bottom, y / (size - 1));
    const colour = Jimp.rgbaToInt(r, g, b, 255);
    for (let x = 0; x < size; x += 1) canvas.setPixelColor(colour, x, y);
  }
  return canvas;
}

/** Composites `over` onto a solid `rgb` square (the adaptive-icon preview). */
function onSolid(over, rgb) {
  const base = new Jimp(over.bitmap.width, over.bitmap.height, 0xffffffff);
  base.scan(0, 0, base.bitmap.width, base.bitmap.height, (x, y, idx) => {
    base.bitmap.data[idx] = rgb[0];
    base.bitmap.data[idx + 1] = rgb[1];
    base.bitmap.data[idx + 2] = rgb[2];
  });
  return base.composite(over, 0, 0);
}

/** White where the artwork is (alpha kept), with the dark eyes cut out: Android themed icons. */
function silhouette(image) {
  const out = image.clone();
  out.scan(0, 0, out.bitmap.width, out.bitmap.height, (x, y, idx) => {
    const d = out.bitmap.data;
    const luma = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
    const isEye = d[idx + 3] > 200 && luma < 55;
    d[idx] = 255;
    d[idx + 1] = 255;
    d[idx + 2] = 255;
    if (isEye) d[idx + 3] = 0;
  });
  return out;
}

/** A circle-masked copy, as a launcher would crop it (safe-zone check). */
function circleMask(image, diameterShare) {
  const out = image.clone();
  const { width, height } = out.bitmap;
  const r = (width * diameterShare) / 2;
  out.scan(0, 0, width, height, (x, y, idx) => {
    if (Math.hypot(x - width / 2, y - height / 2) > r) {
      out.bitmap.data[idx + 3] = 0;
    }
  });
  return out;
}

const save = async (image, name) => {
  await image.writeAsync(path.join(outDir, name));
  if (previewDir) await image.writeAsync(path.join(previewDir, name));
  console.log(`${name}  ${image.bitmap.width}x${image.bitmap.height}`);
};

if (previewDir) await mkdir(previewDir, { recursive: true });
const character = cropToContent(await Jimp.read(sourcePath));

// Mist (the brand wash) fading to white behind the iOS icon.
const mist = [0xe3, 0xf3, 0xfb];
const icon = gradient(SIZE, mist, WHITE).composite(
  fillSquare(character, SIZE, ICON_FILL),
  0,
  0,
);
await save(icon, 'icon.png');

const adaptive = fitInCircle(
  character,
  SIZE,
  ADAPTIVE_SAFE_DIAMETER * ADAPTIVE_HEADROOM,
);
await save(adaptive, 'adaptive-icon.png');
await save(silhouette(adaptive), 'adaptive-icon-monochrome.png');
await save(fillSquare(character, FAVICON_SIZE, 1), 'favicon.png');

if (previewDir) {
  // What a launcher shows: the 108dp layer cropped to its safe circle.
  const masked = circleMask(onSolid(adaptive, BACKGROUND), 66 / 108);
  await masked.writeAsync(path.join(previewDir, 'preview-adaptive-masked.png'));
  const themed = circleMask(
    onSolid(silhouette(adaptive), [40, 60, 72]),
    66 / 108,
  );
  await themed.writeAsync(
    path.join(previewDir, 'preview-monochrome-masked.png'),
  );
}

console.log(`\nadaptive background ${hex(BACKGROUND)} (app.json)`);
