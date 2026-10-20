import { shellScreenOptions } from '../ShellStack';

describe('shellScreenOptions', () => {
  it('slides pages in from the right by default', () => {
    const o = shellScreenOptions({ ground: '#fff', reduceMotion: false });
    expect(o.animation).toBe('slide_from_right');
    expect(o.contentStyle).toEqual({ backgroundColor: '#fff' });
  });

  it('cross-fades instead of sliding under Reduce Motion', () => {
    const o = shellScreenOptions({ ground: '#000', reduceMotion: true });
    expect(o.animation).toBe('fade');
  });
});
