import '@/lib/i18n';

import { PortalHost } from '@rn-primitives/portal';
import { SchemeScope } from '@booking/ui';
import * as React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import renderer, { act } from 'react-test-renderer';

import { BaseGallery } from '../BaseGallery';
import { ControlsGallery } from '../ControlsGallery';
import { PatternsGallery } from '../PatternsGallery';
import { PrimitivesGallery } from '../PrimitivesGallery';
import { SurfacesGallery } from '../SurfacesGallery';
import { TokensGallery } from '../TokensGallery';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { canGoBack: () => false, back: jest.fn(), replace: jest.fn() },
  usePathname: () => '/',
}));

const SECTIONS = {
  tokens: TokensGallery,
  primitives: PrimitivesGallery,
  controls: ControlsGallery,
  surfaces: SurfacesGallery,
  patterns: PatternsGallery,
  base: BaseGallery,
} as const;

describe('design system gallery', () => {
  const trees: renderer.ReactTestRenderer[] = [];
  afterEach(() => {
    act(() => trees.splice(0).forEach((tree) => tree.unmount()));
  });

  it.each(
    Object.keys(SECTIONS).flatMap((name) =>
      (['light', 'dark'] as const).map((scheme) => [name, scheme] as const),
    ),
  )('renders the %s section in %s', (name, scheme) => {
    const Section = SECTIONS[name as keyof typeof SECTIONS];
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <SafeAreaProvider
          initialMetrics={{
            insets: { top: 0, left: 0, right: 0, bottom: 0 },
            frame: { x: 0, y: 0, width: 402, height: 874 },
          }}
        >
          <SchemeScope scheme={scheme}>
            <Section />
          </SchemeScope>
          <PortalHost />
        </SafeAreaProvider>,
      );
    });
    trees.push(tree);
    expect(JSON.stringify(tree.toJSON()).length).toBeGreaterThan(500);
  });
});
