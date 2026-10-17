import { mount } from '@/testing/render';

import { MomentClovie } from '../components/MomentClovie';

let mockActive = true;
jest.mock('@/hooks/useMotionActive', () => ({
  useMotionActive: () => mockActive,
}));
let mockProps: Record<string, unknown> = {};
jest.mock('@/features/brand/ClovieAnimated', () => ({
  ClovieAnimated: (props: Record<string, unknown>) => {
    mockProps = props;
    return null;
  },
}));

const base = { placement: 'moment', blinkToken: 0 } as const;

describe('MomentClovie', () => {
  it('runs the live Clovie while the tab is focused and in the foreground', () => {
    mockActive = true;
    mount(<MomentClovie {...base} state="idle" size={64} />);
    expect(mockProps).toMatchObject({ isPaused: false, state: 'default' });
  });

  it('pauses to the still image when motion is gated off', () => {
    mockActive = false;
    mount(<MomentClovie {...base} state="idle" size={64} />);
    expect(mockProps.isPaused).toBe(true);
  });

  it('works while the companion is busy and idles on the reply nod', () => {
    mockActive = true;
    mount(<MomentClovie {...base} state="working" size={44} />);
    expect(mockProps).toMatchObject({ state: 'working', size: 44 });
    mount(<MomentClovie {...base} state="nod" size={44} />);
    expect(mockProps.state).toBe('default');
  });

  it('draws the hero slot larger than the SDK box', () => {
    mount(<MomentClovie {...base} state="idle" size={64} />);
    expect(mockProps.size).toBeGreaterThan(64);
  });
});
