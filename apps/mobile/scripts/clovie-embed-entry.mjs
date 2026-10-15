// Entry of the offline Clovie bundle (see build-clovie-embed.mjs). Runs inside
// the WebView: reads window.__CLOVIE__ = { state, size, paused, pose? } and draws the
// bot-avatars clover, then tells the app once the canvas has painted.
import { BotAvatar } from 'bot-avatars';
import * as React from 'react';
import { createRoot } from 'react-dom/client';

const config = window.__CLOVIE__ ?? {};

/** Frames to wait after the canvas is sized, so the first draw has presented. */
const SETTLE_FRAMES = 3;
const MAX_WAIT_FRAMES = 600;

/**
 * Posts 'ready' only once the avatar's canvas is connected and has a non-zero
 * size (so it can have drawn), plus a few frames for the paint to present.
 * Gives up waiting after ~10s at 60fps and posts anyway, so the app is never stuck on the still.
 */
function notifyReady() {
  const post = window.ReactNativeWebView?.postMessage;
  if (!post) return;
  let waited = 0;
  let settled = 0;
  const tick = () => {
    const canvas = document.querySelector('canvas');
    const painted = Boolean(
      canvas && canvas.isConnected && canvas.width > 0 && canvas.height > 0,
    );
    waited += 1;
    settled = painted ? settled + 1 : 0;
    if (settled >= SETTLE_FRAMES || waited >= MAX_WAIT_FRAMES) {
      window.ReactNativeWebView.postMessage('ready');
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function Clovie() {
  React.useEffect(notifyReady, []);
  return React.createElement(BotAvatar, {
    type: 'clover',
    shading: 'fabric',
    state: config.state === 'working' ? 'working' : 'default',
    size: config.size ?? '64px',
    paused: Boolean(config.paused),
    // Optional held orientation (radians), used by the icon stills.
    pose: config.pose,
    'aria-hidden': 'true',
    // Taps belong to the app, not to the avatar's click-to-hop.
    style: { pointerEvents: 'none' },
  });
}

createRoot(document.getElementById('root')).render(React.createElement(Clovie));
