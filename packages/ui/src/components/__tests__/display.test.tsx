import { Inbox } from 'lucide-react-native';
import * as React from 'react';
import { Image } from 'react-native';

import { act, byLabel, pressable, render, textOf } from '../../testing/render';
import { getDepth } from '../../tokens/depth';
import { Avatar } from '../Avatar';
import { Capsule, type CapsuleTone } from '../Capsule';
import { DoneCard } from '../DoneCard';
import { Group, GroupRow, SectionTitle } from '../Group';
import { IconDome } from '../IconDome';
import { CheckPoint, SuccessMark } from '../SuccessMark';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

function styleOf(tree: ReturnType<typeof render>, key: string) {
  const styles = tree.root
    .findAll((n) => typeof n.type === 'string')
    .flatMap((n) => [n.props.style].flat(3) as Record<string, unknown>[]);
  return styles.reverse().find((s) => s && key in s)?.[key];
}

describe('Capsule', () => {
  it.each(['neutral', 'amber', 'green', 'grey'] as CapsuleTone[])(
    'fills the %s tone from the depth tokens in both schemes',
    (tone) => {
      for (const scheme of ['light', 'dark'] as const) {
        const tree = render(<Capsule label="VIP" tone={tone} />, scheme);
        expect(textOf(tree)).toBe('VIP');
        expect(styleOf(tree, 'backgroundColor')).toBe(
          getDepth(scheme).capsule[tone].fill,
        );
      }
    },
  );

  it('colours the label of a status tone, and leaves the neutral one to the muted class', () => {
    const amber = render(<Capsule label="Needs a reply" tone="amber" />);
    expect(styleOf(amber, 'color')).toBe(getDepth('light').capsule.amber.text);
    const neutral = render(<Capsule label="VIP" />);
    expect(styleOf(neutral, 'color')).toBeUndefined();
  });
});

describe('Avatar', () => {
  it.each([
    ['sm', 'h-9'],
    ['md', 'h-11'],
    ['lg', 'h-14'],
    ['xl', 'h-20'],
  ] as const)('sizes %s as %s', (size, expected) => {
    const tree = render(<Avatar name="Zanele Mthembu" size={size} />);
    const dome = tree.root.find(
      (n) => n.props.importantForAccessibility === 'no-hide-descendants',
    );
    expect(String(dome.props.className)).toContain(expected);
  });

  it('shows initials, hidden from screen readers', () => {
    const tree = render(<Avatar name="Zanele Mthembu" />);
    expect(textOf(tree)).toBe('ZM');
    expect(
      tree.root.find((n) => n.props.accessibilityElementsHidden === true),
    ).toBeTruthy();
  });

  it('shows a question mark for a missing name', () => {
    expect(textOf(render(<Avatar name={null} />))).toBe('?');
  });

  it('prefers the photo over initials', () => {
    const tree = render(
      <Avatar name="Ashgrove" imageUrl="https://example.com/logo.png" />,
    );
    expect(tree.root.findAllByType(Image)).toHaveLength(1);
    expect(textOf(tree)).toBe('');
  });
});

describe('IconDome', () => {
  it.each([
    ['md', 'h-[52px]'],
    ['lg', 'h-16'],
  ] as const)('sizes %s as %s', (size, expected) => {
    const tree = render(<IconDome icon={Inbox} size={size} />);
    expect(JSON.stringify(tree.toJSON())).toBeTruthy();
    expect(
      tree.root.findAll((n) =>
        String(n.props.className ?? '').includes(expected),
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe('Group, GroupRow and SectionTitle', () => {
  it('renders a heading for the section', () => {
    const tree = render(<SectionTitle>Contact</SectionTitle>);
    expect(tree.root.find((n) => n.props.role === 'heading')).toBeTruthy();
    expect(textOf(tree)).toBe('Contact');
  });

  it('is a pressable button with a "title, detail" spoken label', () => {
    const onPress = jest.fn();
    const tree = render(
      <Group>
        <GroupRow title="Hours" detail="Mon to Sat" onPress={onPress} />
      </Group>,
    );
    const row = pressable(tree, 'Hours, Mon to Sat');
    expect(row.props.accessibilityRole).toBe('button');
    act(() => row.props.onPress());
    expect(onPress).toHaveBeenCalled();
  });

  it('lets a custom accessibility label win', () => {
    const tree = render(
      <GroupRow
        title="Hours"
        detail="Mon"
        accessibilityLabel="Open hours"
        onPress={jest.fn()}
      />,
    );
    expect(pressable(tree, 'Open hours')).toBeTruthy();
  });

  it('is a plain row without onPress', () => {
    const tree = render(<GroupRow title="Version" detail="1.0" />);
    expect(byLabel(tree, 'Version, 1.0')).toHaveLength(0);
    expect(textOf(tree)).toContain('Version');
  });

  it('leads with an avatar and indents its separator further than a glyph row', () => {
    const avatar = render(
      <GroupRow avatarName="Thandi Mokoena" title="Thandi" showSeparator />,
    );
    const glyph = render(<GroupRow icon={Inbox} title="Inbox" showSeparator />);
    const plain = render(<GroupRow title="Plain" showSeparator />);
    const left = (tree: ReturnType<typeof render>) =>
      tree.root
        .findAll((n) =>
          String(n.props.className ?? '').includes('absolute right-0 top-0'),
        )
        .map((n) => (n.props.style as { left: number }).left);
    // Where the title starts: 16 padding + avatar 44 + 12 gap, glyph 20 + 14 gap.
    expect(left(avatar)).toContain(72);
    expect(left(glyph)).toContain(50);
    expect(left(plain)).toContain(16);
    expect(textOf(avatar)).toContain('TM');
  });

  it('colours a destructive title and a success detail', () => {
    const tree = render(
      <GroupRow
        title="Sign out"
        destructive
        detail="Connected"
        detailTone="success"
      />,
    );
    const all = JSON.stringify(
      tree.root
        .findAll((n) => typeof n.type !== 'string')
        .map((n) => n.props.className ?? ''),
    );
    expect(all).toContain('text-destructive');
    expect(styleOf(tree, 'color')).toBe(getDepth('light').colors.green);
  });

  it('replaces the chevron with trailing content', () => {
    const tree = render(
      <GroupRow
        title="Notifications"
        trailing={<>{'switch here'}</>}
        onPress={jest.fn()}
      />,
    );
    expect(textOf(tree)).toContain('switch here');
  });
});

describe('DoneCard, SuccessMark and CheckPoint', () => {
  it('announces the result politely and lists what happened', () => {
    const tree = render(
      <DoneCard title="Booked" lines={['Zanele, 10:30', 'Told on WhatsApp']} />,
    );
    expect(
      tree.root.find((n) => n.props.accessibilityLiveRegion === 'polite'),
    ).toBeTruthy();
    expect(textOf(tree)).toContain('Booked');
    expect(textOf(tree)).toContain('Told on WhatsApp');
    expect(
      tree.root.findAllByProps({ role: 'heading' }).length,
    ).toBeGreaterThan(0);
  });

  it('can show the large filled mark instead of the calm dome', () => {
    const dome = render(<DoneCard title="Done" lines={[]} />);
    const solid = render(<DoneCard variant="solid" title="Done" lines={[]} />);
    const hidden = (t: ReturnType<typeof render>) =>
      t.root.findAll(
        (n) => n.props.importantForAccessibility === 'no-hide-descendants',
      ).length;
    expect(hidden(solid)).toBeGreaterThan(hidden(dome));
  });

  it('draws the success mark at the requested size, in the scheme green', () => {
    const tree = render(<SuccessMark size={64} />, 'dark');
    expect(styleOf(tree, 'width')).toBe(64);
    expect(styleOf(tree, 'backgroundColor')).toBe(
      getDepth('dark').colors.success,
    );
  });

  it('shows a green check beside the text', () => {
    expect(textOf(render(<CheckPoint text="Share your link" />))).toBe(
      'Share your link',
    );
  });
});
