import type { ClovieState } from '@/features/brand/clovieHtml';

import type { ClovieEmotion } from './poses';

/**
 * Which state of the real companion backs an emotion. Only the presenter
 * works (he hops and laughs, which suits pointing at a card). Everything else
 * stays `default`: switching state reloads the canvas, so a calm, steady
 * companion avoids a reload on most card changes.
 */
export function liveStateFor(emotion: ClovieEmotion): ClovieState {
  return emotion === 'presenter' ? 'working' : 'default';
}
