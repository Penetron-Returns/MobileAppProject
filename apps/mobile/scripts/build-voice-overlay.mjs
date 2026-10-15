#!/usr/bin/env node
/**
 * Bundles the Hey Clovie overlay page (modules/clovie-voice/overlay) into one
 * self-contained HTML file the Android service loads in its overlay WebView.
 *
 *   node scripts/build-voice-overlay.mjs
 *
 * Writes modules/clovie-voice/android/src/main/assets/overlay/overlay.html.
 * The output is committed so a native build never needs esbuild.
 */
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const module = path.resolve(here, '../modules/clovie-voice');
const out = path.join(module, 'android/src/main/assets/overlay/overlay.html');

const result = await build({
  entryPoints: [path.join(module, 'overlay/overlay.mjs')],
  bundle: true,
  write: false,
  minify: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  charset: 'ascii',
});
// A literal closing script tag would end the inline <script> early.
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\/script');
const html = (
  await readFile(path.join(module, 'overlay/overlay.html'), 'utf8')
).replace('<!--SCRIPT-->', () => `<script>${js}</script>`);
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, html);
console.log(
  `wrote ${path.relative(process.cwd(), out)} (${html.length} bytes)`,
);
