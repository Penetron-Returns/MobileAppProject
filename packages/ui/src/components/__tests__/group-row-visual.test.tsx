import { StyleSheet } from 'react-native';
import { View } from 'react-native';

import { render, textOf } from '../../testing/render';
import { Group, GroupRow } from '../Group';

jest.mock('lucide-react-native', () => {
  const { View: Stub } = require('react-native');
  return new Proxy({}, { get: () => Stub });
});

const flat = (style: unknown) =>
  (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;

/** The engraved separator is a 2pt line inset from the left edge. */
const dividerInsets = (tree: ReturnType<typeof render>) => [
  ...new Set(
    tree.root
      .findAll((n) => n.props.pointerEvents === 'none' && n.props.style)
      .map((n) => flat(n.props.style).left)
      .filter((left) => typeof left === 'number'),
  ),
];

describe('GroupRow visual', () => {
  it('leaves a row without a visual exactly as it was', () => {
    const tree = render(
      <Group>
        <GroupRow title="One" />
        <GroupRow showSeparator title="Two" subtitle="line" />
      </Group>,
    );
    expect(tree.root.findAll((n) => n.props.testID === 'thumb')).toHaveLength(
      0,
    );
    expect(dividerInsets(tree)).toEqual([16]);
  });

  it('shows the visual on the left, hidden from screen readers', () => {
    const tree = render(
      <GroupRow title="Earliest booking" visual={<View testID="thumb" />} />,
    );
    expect(
      tree.root.findAll((n) => n.props.testID === 'thumb'),
    ).not.toHaveLength(0);
    const wrapper = tree.root.find(
      (n) => n.props.importantForAccessibility === 'no-hide-descendants',
    );
    expect(wrapper.props.accessibilityElementsHidden).toBe(true);
  });

  it('starts the separator after the 76pt thumbnail (44pt small)', () => {
    const big = render(
      <Group>
        <GroupRow title="A" visual={<View />} />
        <GroupRow showSeparator title="B" visual={<View />} />
      </Group>,
    );
    expect(dividerInsets(big)).toEqual([104]);
    const small = render(
      <Group>
        <GroupRow title="A" visual={<View />} visualSize="sm" />
        <GroupRow showSeparator title="B" visual={<View />} visualSize="sm" />
      </Group>,
    );
    expect(dividerInsets(small)).toEqual([70]);
  });

  it('lets the help line wrap instead of truncating', () => {
    const tree = render(
      <GroupRow
        title="Earliest booking"
        subtitle="Clients can't book sooner than this."
        visual={<View />}
      />,
    );
    const help = tree.root.find(
      (n) =>
        (n.type as unknown) === 'Text' && textOf(n).includes("Clients can't"),
    );
    expect(help.props.numberOfLines).toBeUndefined();
  });
});
