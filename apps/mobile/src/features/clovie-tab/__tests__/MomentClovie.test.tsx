import { mount } from '@/testing/render';

import { MomentClovie } from '../components/MomentClovie';

let mockActive = true;
jest.mock('@/hooks/useMotionActive', () => ({
  useMotionActive: () => mockActive,
}));
let mockLive: Record<string, unknown> | null = null;
jest.mock('@/features/brand/ClovieAnimated', () => ({
  ClovieAnimated: (props: Record<string, unknown>) => {
    mockLive = props;
    return null;
  },
}));
let mockSprite: Record<string, unknown> | null = null;
jest.mock('@/features/clovie-character/ClovieSprite', () => ({
  ClovieSprite: (props: Record<string, unknown>) => {
    mockSprite = props;
    return null;
  },
}));

const base = { placement: 'moment', blinkToken: 0 } as const;

beforeEach(() => {
  mockLive = null;
  mockSprite = null;
  mockActive = true;
});

describe('MomentClovie', () => {
  it('draws idle as the blinking sprite, with no WebView renderer', () => {
    mount(<MomentClovie {...base} state="idle" size={64} />);
    expect(mockSprite).toMatchObject({ isActive: true });
    expect(mockLive).toBeNull();
  });

  it('stops blinking when motion is gated off', () => {
    mockActive = false;
    mount(<MomentClovie {...base} state="idle" size={64} />);
    expect(mockSprite?.isActive).toBe(false);
  });

  it('keeps the live renderer for working only, mounted deferred', () => {
    mount(<MomentClovie {...base} state="working" size={44} />);
    expect(mockLive).toMatchObject({
      state: 'working',
      size: 44,
      isDeferred: true,
      isPaused: false,
    });
    expect(mockSprite).toBeNull();
  });

  it('idles on the sprite after the reply nod', () => {
    mount(<MomentClovie {...base} state="nod" size={44} />);
    expect(mockSprite).not.toBeNull();
    expect(mockLive).toBeNull();
  });

  it('draws the hero slot larger than the SDK box', () => {
    mount(<MomentClovie {...base} state="idle" size={64} />);
    expect(mockSprite?.size).toBeGreaterThan(64);
  });
});
