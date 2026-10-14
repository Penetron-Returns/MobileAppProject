import {
  Divider,
  Ground,
  Icon,
  Pressable,
  Skeleton,
  Surface,
  Text,
  useDepth,
  type SurfaceVariant,
} from '@booking/ui';
import { Heart, Scissors } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { Row, Section, Specimen } from './Specimen';

const TEXT_VARIANTS = [
  'large-title',
  'section',
  'title',
  'subtitle',
  'meta',
  'button',
  'default',
  'h1',
  'h2',
  'h3',
  'h4',
  'lead',
  'large',
  'small',
  'muted',
  'p',
  'code',
] as const;

const SURFACES: SurfaceVariant[] = [
  'raised',
  'hero',
  'floating',
  'inset',
  'dome',
  'knob',
  'engrave',
];

export function PrimitivesGallery() {
  const depth = useDepth();
  return (
    <>
      <Section title="Text" note="`variant` picks a step of the type scale">
        {TEXT_VARIANTS.map((variant) => (
          <Specimen key={variant} label={variant}>
            <Text variant={variant}>Zanele Mthembu, 10:30</Text>
          </Specimen>
        ))}
      </Section>

      <Section title="Surface and Ground">
        <Ground className="gap-3 rounded-2xl p-4">
          {SURFACES.map((variant) => (
            <Specimen key={variant} label={`variant="${variant}"`}>
              <Surface
                variant={variant}
                className={
                  variant === 'engrave'
                    ? 'h-1'
                    : variant === 'dome' || variant === 'knob'
                      ? 'h-12 w-12 rounded-full'
                      : 'h-12 px-4 justify-center'
                }
              >
                {variant === 'engrave' ||
                variant === 'dome' ||
                variant === 'knob' ? null : (
                  <Text className="text-subtitle">{variant}</Text>
                )}
              </Surface>
            </Specimen>
          ))}
        </Ground>
      </Section>

      <Section title="Divider" note="Engraved line between rows of a group">
        <Surface variant="raised" className="overflow-hidden">
          {([16, 52, 68] as const).map((inset) => (
            <View key={inset} className="min-h-12 justify-center px-4">
              <Divider inset={inset} />
              <Text className="text-title">inset {inset}</Text>
            </View>
          ))}
        </Surface>
      </Section>

      <Section title="Pressable" note="Pressed feedback is built in">
        <Row>
          {(['dim', 'inset', 'nudge', 'none'] as const).map((feedback) => (
            <Pressable
              key={feedback}
              feedback={feedback}
              accessibilityRole="button"
              accessibilityLabel={`Pressable ${feedback}`}
              style={[depth.button, { borderRadius: 20 }]}
              className="h-11 items-center justify-center px-4"
            >
              <Text className="text-subtitle font-semibold">{feedback}</Text>
            </Pressable>
          ))}
        </Row>
      </Section>

      <Section title="Icon" note="Lucide glyph with className colour">
        <Row>
          <Icon as={Scissors} size={24} className="text-foreground" />
          <Icon as={Heart} size={24} className="text-destructive" />
          <Icon as={Heart} size={24} className="text-primary" />
          <Icon as={Heart} size={24} className="text-muted-foreground" />
        </Row>
      </Section>

      <Section title="Skeleton">
        <View className="gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-11 w-11 rounded-full" />
        </View>
      </Section>
    </>
  );
}
