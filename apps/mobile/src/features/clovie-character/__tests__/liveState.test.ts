import { liveStateFor } from '../liveState';
import { EMOTIONS } from '../poses';

describe('liveStateFor', () => {
  it.each(EMOTIONS.map((e) => [e, e === 'presenter' ? 'working' : 'default']))(
    'maps %s to the %s companion',
    (emotion, state) => {
      expect(liveStateFor(emotion as (typeof EMOTIONS)[number])).toBe(state);
    },
  );
});
