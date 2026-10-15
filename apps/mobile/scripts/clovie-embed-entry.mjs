// Entry of the offline Clovie bundle (see build-clovie-embed.mjs). Runs inside
// the WebView: reads window.__CLOVIE__ = { state, size, paused } and draws the
// bot-avatars clover, then tells the app once the canvas has painted.
import { BotAvatar } from 'bot-avatars';
import * as React from 'react';
import { createRoot } from 'react-dom/client';

const config = window.__CLOVIE__ ?? {};

function notifyReady() {
  const post = window.ReactNativeWebView?.postMessage;
  if (!post) return;
  // Two frames: the first paints the canvas, the second lets it present.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => window.ReactNativeWebView.postMessage('ready')),
  );
}

function Clovie() {
  React.useEffect(notifyReady, []);
  return React.createElement(BotAvatar, {
    type: 'clover',
    shading: 'fabric',
    state: config.state === 'working' ? 'working' : 'default',
    size: config.size ?? '64px',
    paused: Boolean(config.paused),
    'aria-hidden': 'true',
    // Taps belong to the app, not to the avatar's click-to-hop.
    style: { pointerEvents: 'none' },
  });
}

createRoot(document.getElementById('root')).render(React.createElement(Clovie));
