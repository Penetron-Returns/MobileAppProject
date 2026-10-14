import i18n from 'i18next';
import { colorScheme } from 'nativewind';
import * as React from 'react';
import { initReactI18next } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import renderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';

/**
 * Test helpers for design system components. The suites run without a host
 * i18n instance, so every string is the package's English default.
 */

// No resources: components fall back to their defaultValue, interpolated.
if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    lng: 'en',
    resources: {},
    initAsync: false,
    interpolation: { escapeValue: false },
  });
}

// Trees are unmounted after every test: portalled content (sheets, dialogs)
// lives in a global store and would otherwise leak into the next test.
const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((tree) => tree.unmount());
  });
});

const METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 34 },
  frame: { x: 0, y: 0, width: 402, height: 874 },
};

export function render(
  element: React.ReactElement,
  scheme: 'light' | 'dark' = 'light',
): ReactTestRenderer {
  act(() => {
    colorScheme.set(scheme);
  });
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>,
    );
  });
  mounted.push(tree);
  return tree;
}

/** Every rendered node (host or composite) that carries this accessibility label. */
export function byLabel(tree: ReactTestRenderer, label: string) {
  return tree.root.findAll((n) => n.props.accessibilityLabel === label);
}

/** The host element (the one that reaches the native view) with this testID. */
export function host(
  tree: ReactTestRenderer,
  testID: string,
): ReactTestInstance {
  return tree.root.find(
    (n) => typeof n.type === 'string' && n.props.testID === testID,
  );
}

/** The first node with this label that can be pressed. */
export function pressable(
  tree: ReactTestRenderer,
  label: string,
): ReactTestInstance {
  return tree.root.find(
    (n) => n.props.accessibilityLabel === label && !!n.props.onPress,
  );
}

/** Concatenated text of every string child under a node. */
export function textOf(node: ReactTestInstance | ReactTestRenderer): string {
  const root = 'root' in node ? node.root : node;
  const parts: string[] = [];
  const visit = (n: ReactTestInstance | string) => {
    if (typeof n === 'string') parts.push(n);
    else n.children.forEach(visit);
  };
  visit(root);
  return parts.join(' ');
}

export { act };
