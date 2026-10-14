import {
  Ground,
  IconButton,
  SchemeScope,
  SegmentedControl,
  Text,
  useAppColorScheme,
} from '@booking/ui';
import { Redirect } from 'expo-router';
import { Moon, Sun } from 'lucide-react-native';
import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BaseGallery } from '@/features/gallery/BaseGallery';
import { ControlsGallery } from '@/features/gallery/ControlsGallery';
import { PatternsGallery } from '@/features/gallery/PatternsGallery';
import { PrimitivesGallery } from '@/features/gallery/PrimitivesGallery';
import { SurfacesGallery } from '@/features/gallery/SurfacesGallery';
import { TokensGallery } from '@/features/gallery/TokensGallery';

type Layer = 'tokens' | 'primitives' | 'components' | 'patterns' | 'base';
type Themes = 'light' | 'dark' | 'both';

const LAYERS = [
  { value: 'tokens', label: 'Tokens' },
  { value: 'primitives', label: 'Primitives' },
  { value: 'components', label: 'Components' },
  { value: 'patterns', label: 'Patterns' },
  { value: 'base', label: 'Base' },
] as const;
const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'both', label: 'Both' },
] as const;

function LayerView({ layer }: { layer: Layer }) {
  switch (layer) {
    case 'tokens':
      return <TokensGallery />;
    case 'primitives':
      return <PrimitivesGallery />;
    case 'components':
      return (
        <>
          <ControlsGallery />
          <SurfacesGallery />
        </>
      );
    case 'patterns':
      return <PatternsGallery />;
    case 'base':
      return <BaseGallery />;
  }
}

/**
 * The design system gallery: every token, primitive, component and pattern in
 * every variant and state, in light, dark or both at once. Dev-only: guarded
 * below so it never ships in a production build.
 */
export default function GalleryScreen() {
  const insets = useSafeAreaInsets();
  const { isDark, toggle } = useAppColorScheme();
  const [layer, setLayer] = React.useState<Layer>('tokens');
  const [themes, setThemes] = React.useState<Themes>('light');

  if (!__DEV__) return <Redirect href="/" />;

  const schemes = themes === 'both' ? (['light', 'dark'] as const) : [themes];

  return (
    <Ground className="flex-1">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 48,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-3 px-5 pb-2">
          <View className="flex-row items-center justify-between">
            <Text
              role="heading"
              aria-level="1"
              className="text-large-title font-bold"
            >
              Design system
            </Text>
            <IconButton
              icon={isDark ? Sun : Moon}
              label="Toggle app theme"
              onPress={toggle}
            />
          </View>
          <SegmentedControl
            label="Layer"
            value={layer}
            onChange={setLayer}
            options={LAYERS}
          />
          <SegmentedControl
            label="Theme"
            value={themes}
            onChange={setThemes}
            options={THEMES}
          />
        </View>
        {schemes.map((scheme) => (
          <SchemeScope key={scheme} scheme={scheme}>
            <Text className="text-meta mx-5 mt-4 uppercase text-muted-foreground">
              {scheme}
            </Text>
            <LayerView layer={layer} />
          </SchemeScope>
        ))}
      </ScrollView>
    </Ground>
  );
}
