import '@/lib/i18n';

import * as React from 'react';
import renderer from 'react-test-renderer';
import { StyleSheet } from 'react-native';

import { GROUP_MARGIN, ROW_HEIGHT } from '../components/ClientGroup';
import { IndexScrubber, SCRUBBER_WIDTH } from '../components/IndexScrubber';

describe('phone book layout', () => {
  it('keeps the board margins: 20pt left and 36pt right', () => {
    expect(GROUP_MARGIN).toEqual({ marginLeft: 20, marginRight: 36 });
  });

  it('pins the index strip to the right edge with inline styles', () => {
    let tree!: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(
        <IndexScrubber present={new Set(['A'])} onJump={jest.fn()} top={100} />,
      );
    });
    const strip = tree.root.findByProps({
      accessibilityLabel: 'Jump to letter',
    });
    const style = StyleSheet.flatten(strip.props.style);
    expect(style).toMatchObject({
      position: 'absolute',
      right: 2,
      top: 100,
      width: SCRUBBER_WIDTH,
    });
  });
});

describe('phone book rhythm', () => {
  it('uses the roomier row height', () => {
    expect(ROW_HEIGHT).toBe(70);
  });
});
