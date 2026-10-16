import { createMockTransport } from '@nerova/react-native/testing';
import * as React from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { act, flush, mount, text } from '@/testing/render';

import { CompanionSdkHost } from '../sdk/CompanionSdkHost';
import { useCompanionSheet } from '../sdk/companionSheetControl';

const mockCreate = jest.fn();
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  newIdempotencyKey: () => 'key-' + Math.random(),
  api: { createCompanionSession: (...args: unknown[]) => mockCreate(...args) },
}));

let mockEnabled = true;
jest.mock('@/lib/env', () => ({
  get companionSdkEnabled() {
    return mockEnabled;
  },
}));

let mockHasCompanion = true;
jest.mock('@/features/plans/hooks', () => ({
  useEntitlements: () => ({ has: () => mockHasCompanion }),
}));

// The real Clovie is a WebView; here it only reports the state it was given.
const mockClovieStates: string[] = [];
jest.mock('@/features/brand/ClovieAnimated', () => ({
  ClovieAnimated: ({ state }: { state?: string }) => {
    mockClovieStates.push(state ?? 'default');
    return null;
  },
}));

let control!: ReturnType<typeof useCompanionSheet>;
function Probe() {
  control = useCompanionSheet();
  return null;
}

function mountSdk() {
  const transport = createMockTransport({
    setupCompleted: true,
    whatsAppConnected: true,
  });
  const tree = mount(
    <CompanionSdkHost transport={transport}>
      <Probe />
    </CompanionSdkHost>,
  );
  return { tree, transport };
}

function composer(tree: ReturnType<typeof mount>) {
  return tree.root.findByType(TextInput);
}

function surface(tree: ReturnType<typeof mount>) {
  return tree.root.find((n) => n.props.testID === 'sheet-surface');
}

function avatarWrapper(tree: ReturnType<typeof mount>) {
  return tree.root.find((n) => n.props.testID === 'sheet-avatar-wrapper');
}

async function settle() {
  for (let i = 0; i < 5; i++) await flush();
}

beforeEach(() => {
  mockEnabled = true;
  mockHasCompanion = true;
  mockClovieStates.length = 0;
  mockCreate.mockReset();
  mockCreate.mockResolvedValue({
    url: 'https://app.nerova.si/widget/owner-chat/abc#state=s',
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  });
});

describe('CompanionSdkHost', () => {
  it('preloads the session and thread before the sheet is ever opened', async () => {
    const { transport } = mountSdk();
    await settle();

    expect(mockCreate).toHaveBeenCalled();
    expect(
      transport.controls.calls.filter((c) => c.name === 'getThread').length,
    ).toBeGreaterThan(0);
  });

  it('starts closed with no dim and a hidden resting avatar', async () => {
    const { tree } = mountSdk();
    await settle();

    expect(surface(tree).props.pointerEvents).toBe('none');
    // restAvatar="hidden": the SDK unmounts the resting avatar, and we never
    // render a Clovie (WebView) for the rest placement.
    expect(
      tree.root.findAll((n) => n.props.testID === 'sheet-avatar-wrapper'),
    ).toHaveLength(0);
    expect(
      tree.root.findAll((n) => n.props.testID === 'companion-clovie'),
    ).toHaveLength(0);
    expect(mockClovieStates).toHaveLength(0);
    expect(
      tree.root.findAll((n) => n.props.testID === 'sheet-dim'),
    ).toHaveLength(0);
    expect(control.isAvailable).toBe(true);
  });

  it('never lets a full-screen ancestor of the sheet take touches at rest', async () => {
    const { tree } = mountSdk();
    await settle();

    const layer = tree.root.find(
      (n) => n.props.testID === 'companion-sdk-layer',
    );
    const ancestors = [];
    for (let n = surface(tree).parent; n; n = n.parent) {
      if (typeof n.type === 'string') ancestors.push(n);
      if (n === layer || n.props.testID === 'companion-sdk-layer') break;
    }
    expect(ancestors.length).toBeGreaterThan(1);
    for (const node of ancestors) {
      const style = StyleSheet.flatten(node.props.style) ?? {};
      const isFill =
        style.flex === 1 ||
        (style.position === 'absolute' &&
          style.top === 0 &&
          style.bottom === 0 &&
          style.left === 0 &&
          style.right === 0);
      if (isFill) {
        expect(['box-none', 'none']).toContain(node.props.pointerEvents);
      }
    }
    expect(layer.props.pointerEvents).toBe('box-none');
    expect(StyleSheet.flatten(layer.props.style)).toMatchObject({
      position: 'absolute',
    });
  });

  it('opens and closes the sheet through the controller', async () => {
    const { tree } = mountSdk();
    await settle();

    await act(async () => control.open());
    await settle();
    expect(surface(tree).props.pointerEvents).toBe('auto');
    expect(composer(tree)).toBeTruthy();
    expect(avatarWrapper(tree).props.accessibilityElementsHidden).toBe(false);
    expect(
      tree.root.findAll(
        (n) =>
          typeof n.type === 'string' && n.props.testID === 'companion-clovie',
      ).length,
    ).toBeGreaterThan(0);

    await act(async () => control.close());
    await settle();
    expect(surface(tree).props.pointerEvents).toBe('none');
  });

  it('passes a draft to the composer without sending it', async () => {
    const { tree, transport } = mountSdk();
    await settle();

    await act(async () => control.open({ draft: 'move Megan to Thursday' }));
    await settle();

    expect(composer(tree).props.value).toBe('move Megan to Thursday');
    expect(
      transport.controls.calls.filter((c) => c.name === 'chat'),
    ).toHaveLength(0);
  });

  it('shows a streamed reply and drives Clovie busy then replied', async () => {
    const { tree } = mountSdk();
    await settle();
    await act(async () => control.open());
    await settle();
    await act(async () => {
      composer(tree).props.onChangeText('How many bookings today?');
    });
    const send = tree.root.find((n) => n.props.testID === 'send-button');
    await act(async () => {
      send.props.onPress();
    });
    await settle();

    expect(text(tree)).toContain('6 bookings today');
    expect(mockClovieStates).toContain('working');
    expect(mockClovieStates[mockClovieStates.length - 1]).toBe('default');
    // The SDK's avatar button owns the label, so our Clovie stays decorative.
    expect(
      tree.root.findAll((n) => n.props.testID === 'companion-clovie')[0].props
        .accessibilityElementsHidden,
    ).toBe(true);
  });

  it('mounts no sheet when the plan has no companion', async () => {
    mockHasCompanion = false;
    const { tree } = mountSdk();
    await settle();

    expect(control.isAvailable).toBe(false);
    expect(
      tree.root.findAll((n) => n.props.testID === 'sheet-surface'),
    ).toHaveLength(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('renders only its children and no sheet when the flag is off', async () => {
    mockEnabled = false;
    const { tree } = mountSdk();
    await settle();

    expect(control.isAvailable).toBe(false);
    expect(
      tree.root.findAll((n) => n.props.testID === 'sheet-surface'),
    ).toHaveLength(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
