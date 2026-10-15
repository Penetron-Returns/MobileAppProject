/**
 * The page inside the Hey Clovie overlay window (design: VoiceWake.dc.html, Clovie on the left).
 * The native side drives it:
 *   setState('listening' | 'processing' | 'done' | 'request' | 'error' | 'idle')
 *   setLevel(0..1)        mic level, ~30 Hz (smoothed again here, so the swell never flickers)
 *   setTranscript(text)   what the owner said
 *   setMessage(text)      the outcome ("Checked in Sipho"), or the reason for an error
 *   setAction(label|null) the "Open Clovie" pill (request state); a tap calls ClovieOverlayBridge.onAction()
 *   setTheme('dark'|'light')  defaults to the system theme
 * Clovie is the real bot-avatars character, as in the app (see scripts/clovie-embed-entry.mjs).
 */
import { BotAvatar } from 'bot-avatars';
import * as React from 'react';
import { createRoot } from 'react-dom/client';

const $ = (id) => document.getElementById(id);
const media = (query) => (window.matchMedia ? window.matchMedia(query).matches : false);
const reducedMotion = media('(prefers-reduced-motion: reduce)');

const LABELS = {
  listening: 'Listening…',
  processing: 'On it…',
  done: 'Done',
  request: 'Heard you',
  error: 'Didn’t catch that',
};

let state = 'idle';
let transcript = '';
let message = '';
let actionLabel = null;

const glow = $('glow');
const swell = $('swell');
const rim = $('rim');
const actionButton = $('action');

function render() {
  document.body.dataset.state = state;
  glow.className = 'vw-glow vw-st-' + state + (state === 'idle' ? '' : ' vw-on');
  let label = LABELS[state] || '';
  let line = transcript;
  if (state === 'request' && transcript) line = '“' + transcript + '”';
  if (state === 'done') line = '';
  if (state === 'error') {
    label = message ? 'Couldn’t do that' : LABELS.error;
    line = message || 'Say “Hey Clovie” again';
  }
  $('label').textContent = label;
  $('line').textContent = line;
  $('msg').textContent = message;
  actionButton.classList.toggle('on', Boolean(actionLabel));
  setClovieState(state === 'processing' ? 'working' : 'default');
}

window.setState = (next) => {
  state = next;
  render();
};
window.setTranscript = (value) => {
  transcript = String(value || '');
  render();
};
window.setMessage = (value) => {
  message = String(value || '');
  render();
};
window.setAction = (value) => {
  actionLabel = value ? String(value) : null;
  actionButton.textContent = '';
  if (actionLabel) {
    actionButton.append(actionLabel);
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('viewBox', '0 0 24 24');
    arrow.setAttribute('width', '18');
    arrow.setAttribute('height', '18');
    arrow.setAttribute('fill', 'none');
    arrow.setAttribute('stroke', 'currentColor');
    arrow.setAttribute('stroke-width', '2.4');
    arrow.setAttribute('stroke-linecap', 'round');
    arrow.setAttribute('stroke-linejoin', 'round');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M5 12h13 M13 6l6 6-6 6');
    arrow.append(path);
    actionButton.append(arrow);
  }
  render();
};
window.setTheme = (theme) => {
  document.body.dataset.theme = theme === 'light' ? 'light' : 'dark';
};
actionButton.addEventListener('click', () => {
  if (window.ClovieOverlayBridge) window.ClovieOverlayBridge.onAction();
});

// The swell: the mic level eases in (fast) and out (slow) so the glow breathes with the voice
// without flicker. Only while listening; other states use the design's fixed heights.
let target = 0;
let level = 0;
window.setLevel = (value) => {
  target = Math.max(0, Math.min(1, Number(value) || 0));
};
function frame() {
  const live = state === 'listening' && !reducedMotion;
  const goal = live ? target : 0;
  level += (goal - level) * (goal > level ? 0.22 : 0.08);
  swell.style.setProperty('--lv', live || level > 0.01 ? (0.85 + level * 0.3).toFixed(3) : '1');
  rim.style.opacity = live ? (0.45 + level * 0.4).toFixed(3) : '';
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Clovie: the still shows until the live canvas has painted, then the live layer fades in over it
// and only afterwards is the still removed, so he never blinks out.
const SETTLE_FRAMES = 3;
const MAX_WAIT_FRAMES = 600;
let setClovieState = () => {};
if (!reducedMotion) {
  const RENDER_SCALE = 1.3; // drawn larger for hop headroom, scaled back down in CSS (#root)
  let set = () => {};
  function Clovie() {
    const [current, setCurrent] = React.useState('default');
    set = setCurrent;
    React.useEffect(() => {
      let waited = 0;
      let settled = 0;
      let cancelled = false;
      const tick = () => {
        if (cancelled) return;
        const canvas = document.querySelector('#root canvas');
        const painted = Boolean(canvas && canvas.isConnected && canvas.width > 0 && canvas.height > 0);
        waited += 1;
        settled = painted ? settled + 1 : 0;
        if (settled >= SETTLE_FRAMES || waited >= MAX_WAIT_FRAMES) {
          $('live').classList.add('ready');
          setTimeout(() => $('still').classList.add('gone'), 200);
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      return () => {
        cancelled = true;
      };
    }, []);
    return React.createElement(BotAvatar, {
      type: 'clover',
      shading: 'fabric',
      state: current,
      size: 72 * RENDER_SCALE + 'px',
      'aria-hidden': 'true',
      style: { pointerEvents: 'none' },
    });
  }
  createRoot($('root')).render(React.createElement(Clovie));
  setClovieState = (next) => set(next);
}

window.setTheme(media('(prefers-color-scheme: light)') ? 'light' : 'dark');
render();
