import { whatsAppStatusKey } from '../whatsapp';

describe('whatsAppStatusKey', () => {
  it.each([
    ['nothing connected', { connected: false, status: null }, 'none'],
    ['live', { connected: true, status: 'live' as const }, 'live'],
    ['paused', { connected: true, status: 'paused' as const }, 'paused'],
    [
      'needs reauth',
      { connected: false, status: 'needs_reauth' as const },
      'needs_reauth',
    ],
    [
      'disconnected',
      { connected: false, status: 'disconnected' as const },
      'disconnected',
    ],
    [
      'live flag without connection',
      { connected: false, status: 'live' as const },
      'none',
    ],
  ])('%s', (_l, channel, expected) => {
    expect(whatsAppStatusKey(channel)).toBe(expected);
  });
});
