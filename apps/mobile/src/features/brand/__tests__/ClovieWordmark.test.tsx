import * as React from 'react';

import { act, mount } from '@/testing/render';

import { ClovieWordmark } from '../ClovieWordmark';

describe('ClovieWordmark', () => {
  it('spells C-l-o-v-ı-e across its text runs', () => {
    const tree = mount(<ClovieWordmark size={48} />);
    const runs = tree.root
      .findAll((n) => (n.type as unknown) === 'Text')
      .map((n) => n.children.join(''));
    expect(runs.join('')).toBe('Clovıe');
  });

  it('is one level-1 heading labelled with the app name', () => {
    const tree = mount(<ClovieWordmark size={48} />);
    const node = tree.root.findByProps({ testID: 'clovie-wordmark' });
    expect(node.props.accessibilityLabel).toBe('Clovie');
    expect(node.props.role).toBe('heading');
    expect(node.props['aria-level']).toBe('1');
  });

  it('places the clover from the measured glyph, centred over the stem', () => {
    const tree = mount(<ClovieWordmark size={48} />);
    expect(tree.root.findAllByProps({ testID: 'clovie-tittle' })).toHaveLength(
      0,
    );
    const glyph = tree.root.findAll(
      (n) => typeof n.props.onTextLayout === 'function',
    )[0];
    act(() => {
      glyph.props.onTextLayout({
        nativeEvent: { lines: [{ y: 0, ascender: 41, xHeight: 26 }] },
      });
      glyph.parent?.parent?.props.onLayout?.({
        nativeEvent: { layout: { width: 20 } },
      });
    });
    const style = tree.root.findByProps({ testID: 'clovie-tittle' }).props
      .style;
    const clover = 48 * 0.3;
    // Centre = width/2 minus half the (negative) tracking; gap of 0.05em above the stem top (15).
    expect(style.left).toBeCloseTo(20 / 2 + 1.2 - clover / 2);
    expect(style.top).toBeCloseTo(15 - 2.4 - clover);
  });
});
