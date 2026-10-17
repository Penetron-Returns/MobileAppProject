import { mount } from '@/testing/render';

import { MomentClovie } from '../components/MomentClovie';

let mockActive = true;
jest.mock('@/hooks/useMotionActive', () => ({
  useMotionActive: () => mockActive,
}));
let mockCharacterProps: Record<string, unknown> = {};
jest.mock('@/features/clovie-character', () => ({
  ClovieCharacter: (props: Record<string, unknown>) => {
    mockCharacterProps = props;
    return null;
  },
}));

const base = { placement: 'moment', blinkToken: 0 } as const;

describe('MomentClovie', () => {
  it('runs the live character while the tab is focused and in the foreground', () => {
    mockActive = true;
    mount(<MomentClovie {...base} state="idle" size={64} />);
    expect(mockCharacterProps).toMatchObject({
      isActive: true,
      isLive: true,
      emotion: 'calm',
    });
  });

  it('shows the still image when motion is gated off', () => {
    mockActive = false;
    mount(<MomentClovie {...base} state="working" size={44} />);
    expect(mockCharacterProps).toMatchObject({
      isActive: false,
      isLive: false,
      emotion: 'thoughtful',
      size: 44,
    });
  });

  it('draws the hero slot larger than the SDK box', () => {
    mockActive = true;
    mount(<MomentClovie {...base} state="nod" size={64} />);
    expect(mockCharacterProps.size).toBeGreaterThan(64);
  });
});
