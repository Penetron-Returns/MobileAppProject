import { CLOVIE_BUNDLE } from './clovieBundle.generated';

export type ClovieState = 'default' | 'working';

/**
 * The self-contained page the WebView loads: a transparent canvas page with
 * the bot-avatars bundle inlined, so nothing is fetched at runtime.
 */
export function buildClovieHtml(state: ClovieState, size: number): string {
  const config = JSON.stringify({ state, size: `${size}px` });
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent}</style></head><body><div id="root"></div><script>window.__CLOVIE__=${config};</script><script>${CLOVIE_BUNDLE}</script></body></html>`;
}
