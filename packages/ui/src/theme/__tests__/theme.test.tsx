import * as React from 'react';
import { View } from 'react-native';

import { host, render } from '../../testing/render';
import { THEME } from '../../tokens/colors';
import { getDepth } from '../../tokens/depth';
import { Surface } from '../../primitives/Surface';
import { SchemeScope } from '../SchemeScope';
import { useAppColorScheme } from '../useAppColorScheme';
import { useDepth } from '../useDepth';

function DepthProbe({
  tint,
  out,
}: {
  tint?: string;
  out: { current?: ReturnType<typeof useDepth> };
}) {
  out.current = useDepth(tint);
  return null;
}

function SchemeProbe({
  out,
}: {
  out: { current?: ReturnType<typeof useAppColorScheme> };
}) {
  out.current = useAppColorScheme();
  return null;
}

describe('useDepth', () => {
  it('follows the app scheme', () => {
    const out: { current?: ReturnType<typeof useDepth> } = {};
    render(<DepthProbe out={out} />, 'dark');
    expect(out.current?.scheme).toBe('dark');
  });

  it('accepts a tint', () => {
    const out: { current?: ReturnType<typeof useDepth> } = {};
    render(<DepthProbe out={out} tint="#C2410C" />);
    expect(out.current?.colors.tint).toBe('#C2410C');
  });
});

describe('SchemeScope', () => {
  it('forces the scheme for its subtree only', () => {
    const inside: { current?: ReturnType<typeof useDepth> } = {};
    const outside: { current?: ReturnType<typeof useDepth> } = {};
    render(
      <>
        <SchemeScope scheme="dark">
          <DepthProbe out={inside} />
        </SchemeScope>
        <DepthProbe out={outside} />
      </>,
      'light',
    );
    expect(inside.current?.scheme).toBe('dark');
    expect(outside.current?.scheme).toBe('light');
  });

  it('paints depth surfaces in the forced scheme and sets the role variables', () => {
    const tree = render(
      <SchemeScope scheme="dark">
        <View testID="wrapper">
          <Surface variant="raised" testID="s" />
        </View>
      </SchemeScope>,
      'light',
    );
    const style = [host(tree, 's').props.style].flat(3) as {
      boxShadow?: string;
    }[];
    expect(style.find((s) => s?.boxShadow)?.boxShadow).toBe(
      getDepth('dark').raised.boxShadow,
    );
  });

  it('gives hooks the forced scheme colours', () => {
    const out: { current?: ReturnType<typeof useAppColorScheme> } = {};
    render(
      <SchemeScope scheme="dark">
        <SchemeProbe out={out} />
      </SchemeScope>,
      'light',
    );
    expect(out.current?.isDark).toBe(true);
    expect(out.current?.colors).toBe(THEME.dark);
  });
});
