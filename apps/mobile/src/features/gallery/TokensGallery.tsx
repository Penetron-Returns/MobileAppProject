import {
  COLOR_ROLES,
  LAYOUT,
  MOTION,
  RADII,
  SPACING,
  Surface,
  TYPE_SCALE,
  Text,
  Z_INDEX,
  hsl,
  useAppColorScheme,
  useDepth,
  type ColorRole,
  type SurfaceVariant,
} from '@booking/ui';
import * as React from 'react';
import { View } from 'react-native';

import { Row, Section, Specimen } from './Specimen';

const SURFACES: SurfaceVariant[] = [
  'raised',
  'hero',
  'floating',
  'inset',
  'dome',
  'knob',
  'engrave',
];

function Swatch({ role, value }: { role: ColorRole; value: string }) {
  return (
    <View className="w-[30%] gap-1">
      <View
        style={{ backgroundColor: hsl(value) }}
        className="border-border h-10 rounded-lg border"
      />
      <Text className="text-meta">{role}</Text>
    </View>
  );
}

/** Every token: colour roles, type scale, spacing, radii, depth, motion, stacking. */
export function TokensGallery() {
  const { colorScheme } = useAppColorScheme();
  const depth = useDepth();
  const roles = Object.entries(COLOR_ROLES[colorScheme]) as [
    ColorRole,
    string,
  ][];
  return (
    <>
      <Section title="Colour roles" note={`${colorScheme} · HSL channels`}>
        <View className="flex-row flex-wrap gap-x-3 gap-y-3">
          {roles.map(([role, value]) => (
            <Swatch key={role} role={role} value={value} />
          ))}
        </View>
        <Row>
          {(
            [
              'label',
              'secondary',
              'tint',
              'green',
              'amber',
              'inactive',
            ] as const
          ).map((name) => (
            <View key={name} className="items-center gap-1">
              <View
                style={{ backgroundColor: depth.colors[name] }}
                className="border-border h-8 w-8 rounded-full border"
              />
              <Text className="text-meta">{name}</Text>
            </View>
          ))}
        </Row>
      </Section>

      <Section title="Type scale" note="Size / line height, weight">
        {Object.entries(TYPE_SCALE).map(([name, step]) => (
          <Specimen
            key={name}
            label={`${name} · ${step.size}/${step.lineHeight} · ${step.weight}`}
          >
            <Text
              style={{
                fontSize: step.size,
                lineHeight: step.lineHeight,
                fontWeight: step.weight,
              }}
            >
              Ashgrove Hair
            </Text>
          </Specimen>
        ))}
      </Section>

      <Section title="Spacing" note="4/8 grid, in points">
        <View className="gap-1.5">
          {Object.entries(SPACING).map(([step, points]) => (
            <View key={step} className="flex-row items-center gap-3">
              <Text className="text-meta w-16 text-muted-foreground">
                {step} · {points}
              </Text>
              <View
                style={{ width: Math.max(points, 1) }}
                className="bg-primary h-3 rounded-sm"
              />
            </View>
          ))}
        </View>
        <Text className="text-meta text-muted-foreground">
          Screen padding {LAYOUT.screenPadding} · section gap{' '}
          {LAYOUT.sectionGap} · row {LAYOUT.rowMinHeight} · tap target{' '}
          {LAYOUT.tapTarget}
        </Text>
      </Section>

      <Section title="Radii">
        <Row>
          {Object.entries(RADII).map(([name, radius]) => (
            <View key={name} className="items-center gap-1">
              <Surface
                variant="raised"
                radius={Math.min(radius, 32)}
                className="h-14 w-14"
              />
              <Text className="text-meta">
                {name} {radius === RADII.full ? '∞' : radius}
              </Text>
            </View>
          ))}
        </Row>
      </Section>

      <Section title="Depth" note="Layered shadows and gradients">
        <Row>
          {SURFACES.map((variant) => (
            <View key={variant} className="items-center gap-1">
              <Surface
                variant={variant}
                radius={variant === 'engrave' ? 0 : undefined}
                className={
                  variant === 'engrave'
                    ? 'h-1 w-20'
                    : variant === 'dome' || variant === 'knob'
                      ? 'h-14 w-14 rounded-full'
                      : 'h-14 w-20'
                }
              />
              <Text className="text-meta">{variant}</Text>
            </View>
          ))}
        </Row>
        <Row>
          {(['primary', 'button', 'bar', 'pill', 'badge'] as const).map(
            (name) => (
              <View key={name} className="items-center gap-1">
                <View
                  style={[depth[name], { borderRadius: 14 }]}
                  className="h-10 w-16"
                />
                <Text className="text-meta">{name}</Text>
              </View>
            ),
          )}
        </Row>
      </Section>

      <Section title="Motion and stacking">
        <Text className="text-subtitle text-muted-foreground">
          {Object.entries(MOTION)
            .map(([name, ms]) => `${name} ${ms}ms`)
            .join(' · ')}
        </Text>
        <Text className="text-subtitle text-muted-foreground">
          {Object.entries(Z_INDEX)
            .map(([name, z]) => `${name} ${z}`)
            .join(' · ')}
        </Text>
      </Section>
    </>
  );
}
