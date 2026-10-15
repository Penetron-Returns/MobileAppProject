import { CLOVIE_BUNDLE } from './clovieBundle.generated';

export type ClovieState = 'default' | 'working';

/**
 * bot-avatars draws one still frame when `prefers-reduced-motion` matches
 * inside the page, and on iOS that follows the system setting. The app already
 * gates the WebView on its own reduce-motion check, so the page answers "no
 * preference" for that one query only.
 */
const NO_REDUCED_MOTION_QUERY =
  '(function(){var m=window.matchMedia;if(!m)return;window.matchMedia=function(q){if(/prefers-reduced-motion/.test(q)){return{matches:false,media:q,onchange:null,addListener:function(){},removeListener:function(){},addEventListener:function(){},removeEventListener:function(){},dispatchEvent:function(){return false}}}return m.call(window,q)}})();';

/** The avatar is drawn this much larger (a bigger canvas is hop headroom) and scaled back down. */
export const CLOVIE_RENDER_SCALE = 1.3;

/**
 * The self-contained page the WebView loads: a transparent canvas page with
 * the bot-avatars bundle inlined, so nothing is fetched at runtime. Nothing
 * clips (overflow visible), and the avatar sits centred in the frame.
 */
export function buildClovieHtml(state: ClovieState, size: number): string {
  const config = JSON.stringify({
    state,
    size: `${size * CLOVIE_RENDER_SCALE}px`,
  });
  const scale = 1 / CLOVIE_RENDER_SCALE;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>html,body{margin:0;width:100%;height:100%;background:transparent;overflow:visible;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent}#root{flex:none;transform:scale(${scale})}</style></head><body><div id="root"></div><script>${NO_REDUCED_MOTION_QUERY}window.__CLOVIE__=${config};</script><script>${CLOVIE_BUNDLE}</script></body></html>`;
}
