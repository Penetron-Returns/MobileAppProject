import '@/lib/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import renderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';

/** Shared helpers for app screen tests: real i18n, a fresh query client and safe-area metrics. */

const METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 402, height: 874 },
};

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((tree) => tree.unmount());
  });
});

export function mount(element: React.ReactElement): ReactTestRenderer {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>
      </QueryClientProvider>,
    );
  });
  mounted.push(tree);
  return tree;
}

/** All string children under the tree, joined. */
export function text(tree: ReactTestRenderer): string {
  const parts: string[] = [];
  const visit = (node: ReactTestInstance | string) => {
    if (typeof node === 'string') parts.push(node);
    else node.children.forEach(visit);
  };
  visit(tree.root);
  return parts.join(' | ');
}

/** The first node with this accessibility label that can be pressed. */
export function pressableByLabel(
  tree: ReactTestRenderer,
  label: string,
): ReactTestInstance {
  return tree.root.find(
    (n) => n.props.accessibilityLabel === label && !!n.props.onPress,
  );
}

/** The first pressable node whose visible text contains this. */
export function pressableByText(
  tree: ReactTestRenderer,
  label: string,
): ReactTestInstance {
  const hasText = (n: ReactTestInstance): boolean =>
    n.children.some((c) =>
      typeof c === 'string' ? c.includes(label) : hasText(c),
    );
  return tree.root.findAll((n) => !!n.props.onPress && hasText(n))[0];
}

/** Lets pending promises and effects settle inside act. */
export async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

export { act };
