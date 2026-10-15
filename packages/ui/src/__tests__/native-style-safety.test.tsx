import * as React from 'react';
import { PortalHost } from '@rn-primitives/portal';
import { StyleSheet } from 'react-native';
import type { ReactTestRenderer } from 'react-test-renderer';

import { ColorSwatches } from '../components/ColorSwatches';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Switch } from '../components/Switch';
import { Divider } from '../primitives/Divider';
import { Pressable } from '../primitives/Pressable';
import { Surface, type SurfaceVariant } from '../primitives/Surface';
import { InboxDome } from '../patterns/tab-bar/InboxDome';
import { Text } from '../primitives/Text';
import { render } from '../testing/render';
import { getDepth } from '../tokens/depth';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

/**
 * Android's `LengthPercentage` rejects a null/undefined radius ("Unsupported
 * type for radius property: Null") and Skia then crashes drawing an oval under
 * a rounded clip. No host view may ever carry such a value.
 */
function badRadii(tree: ReactTestRenderer): string[] {
  const bad: string[] = [];
  for (const node of tree.root.findAll((n) => typeof n.type === 'string')) {
    const flat = StyleSheet.flatten(node.props.style) ?? {};
    for (const [key, value] of Object.entries(flat)) {
      if (/Radius$/.test(key) && (value === null || value === undefined)) {
        bad.push(`${String(node.type)}.${key}`);
      }
    }
  }
  return bad;
}

const SURFACES: SurfaceVariant[] = [
  'raised',
  'hero',
  'floating',
  'inset',
  'dome',
  'domeRing',
  'domeTint',
  'knob',
  'engrave',
  'wheel',
  'wheelSelection',
  'wheelTop',
  'wheelBottom',
];

describe('native style safety', () => {
  it.each(['light', 'dark'] as const)(
    'never gives a host view a null radius (%s)',
    (scheme) => {
      const tree = render(
        <>
          {(['dim', 'inset', 'nudge', 'none'] as const).map((feedback) => (
            <Pressable
              key={feedback}
              feedback={feedback}
              style={({ pressed }) => [{ borderRadius: pressed ? 4 : 8 }]}
            >
              <Text>{feedback}</Text>
            </Pressable>
          ))}
          <Switch checked onCheckedChange={jest.fn()} accessibilityLabel="s" />
          <InboxDome count={2} label="Inbox" onPress={jest.fn()} />
          <Divider />
          <ColorSwatches value="blue" onChange={jest.fn()} labelFor={String} />
          {SURFACES.map((variant) => (
            <Surface key={variant} variant={variant} />
          ))}
        </>,
        scheme,
      );
      expect(badRadii(tree)).toEqual([]);
    },
  );

  it('has no null or undefined entry in any depth token', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const depth = getDepth(scheme) as unknown as Record<string, unknown>;
      for (const [name, token] of Object.entries(depth)) {
        if (token && typeof token === 'object' && !Array.isArray(token)) {
          for (const [key, value] of Object.entries(token)) {
            expect([scheme, name, key, value === undefined]).toEqual([
              scheme,
              name,
              key,
              false,
            ]);
          }
        }
      }
    }
  });

  it('keeps container classes off the dialog labels', () => {
    const tree = render(
      <>
        <ConfirmDialog
          open
          onOpenChange={jest.fn()}
          title="Remove?"
          confirmLabel="Remove"
          destructive
          onConfirm={jest.fn()}
        />
        <PortalHost />
      </>,
    );
    const labels = tree.root.findAll(
      (n) =>
        typeof n.type === 'string' &&
        String(n.type) === 'Text' &&
        ['Remove'].includes(String(n.props.children)),
    );
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(String(label.props.className ?? '')).not.toMatch(/active:|bg-/);
    }
  });
});
