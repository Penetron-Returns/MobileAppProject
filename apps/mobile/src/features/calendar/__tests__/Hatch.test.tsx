import { StyleSheet } from 'react-native';

import { act, mount } from '@/testing/render';

import { Hatch, HATCH_TILES } from '../components/Hatch';

let mockScheme: 'light' | 'dark' = 'light';
jest.mock('@booking/ui', () => ({
  ...jest.requireActual('@booking/ui'),
  useDepth: () => ({ scheme: mockScheme, colors: { label: '#000000' } }),
}));

describe('Hatch', () => {
  it.each([
    ['light', HATCH_TILES.light],
    ['dark', HATCH_TILES.dark],
  ] as const)('tiles the %s stripe bitmap', (scheme, tile) => {
    mockScheme = scheme;
    const view = mount(<Hatch width={120} height={80} />);
    const image = view.root.findByProps({ testID: 'hatch' });
    expect(image.props.source).toBe(tile);
    expect(image.props.resizeMode).toBe('repeat');
    expect(StyleSheet.flatten(image.props.style).pointerEvents).toBe('none');
    act(() => view.unmount());
  });

  it('fills the whole span with explicit dimensions (Android needs them to tile)', () => {
    mockScheme = 'light';
    const view = mount(<Hatch width={120} height={80} />);
    const style = StyleSheet.flatten(
      view.root.findByProps({ testID: 'hatch' }).props.style,
    );
    expect(style).toMatchObject({ width: 120, height: 80, top: 0, left: 0 });
    act(() => view.unmount());
  });

  it('uses different tiles for the two schemes', () => {
    expect(HATCH_TILES.light).not.toBe(HATCH_TILES.dark);
  });
});
