import { useAppColorScheme } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Text,
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type TextLayoutEventData,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { BRAND } from './brandColors';

/** The five circles of the clover, in a 24x24 box (cx, cy, r). */
const PETALS = [
  [12, 6.3, 5.7],
  [12, 17.7, 5.7],
  [6.3, 12, 5.7],
  [17.7, 12, 5.7],
  [12, 12, 5],
] as const;

/** Clover size and its gap above the stem, as fractions of the font size. */
const CLOVER_EM = 0.3;
const GAP_EM = 0.05;
/** Room above the line for the clover, which can rise past the line box. */
const HEADROOM_EM = 0.2;
const TRACKING_EM = -0.05;
/** C-l-o-v-ı-e: three runs sharing one font style, so tracking and baseline match a single run. */
const WORD_START = 'Clov';
const DOTLESS_I = String.fromCharCode(0x131);
const WORD_END = 'e';

interface ClovieWordmarkProps {
  /** Font size in pt; the clover and tracking scale with it. */
  size: number;
}

interface Measure {
  /** Advance box of the dotless i, including its (negative) tracking. */
  width: number | null;
  /** Distance from the top of the line to the top of the stem. */
  stemTop: number | null;
}

/**
 * The Clovie wordmark: "Clovie" in the heaviest weight, tracked tight, with
 * the i drawn as a dotless ı under a small clover. One heading element for
 * assistive tech, labelled with the app name. The clover is placed from the
 * measured glyph (the line layout gives baseline and x-height, the advance box
 * gives the centre), so it holds at any size or font scale. Inter ExtraBold is
 * not bundled, so the system font's 800 weight stands in.
 */
export function ClovieWordmark({ size }: ClovieWordmarkProps) {
  const { t } = useTranslation();
  const { isDark } = useAppColorScheme();
  const [measure, setMeasure] = React.useState<Measure>({
    width: null,
    stemTop: null,
  });
  const tracking = TRACKING_EM * size;
  const textStyle = {
    color: isDark ? BRAND.white : BRAND.deep,
    fontSize: size,
    lineHeight: size,
    fontWeight: '800' as const,
    letterSpacing: tracking,
  };
  const cloverSize = size * CLOVER_EM;

  const onLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setMeasure((m) => (m.width === width ? m : { ...m, width }));
  };
  const onTextLayout = (event: NativeSyntheticEvent<TextLayoutEventData>) => {
    const line = event.nativeEvent.lines[0];
    if (!line) return;
    const stemTop = line.y + line.ascender - line.xHeight;
    setMeasure((m) => (m.stemTop === stemTop ? m : { ...m, stemTop }));
  };

  // Until measured: a typical x-height (~0.53em) on a baseline ~0.86em down a 1em line.
  const stemTop = measure.stemTop ?? size * 0.33;
  // The advance box is glyph advance plus the negative tracking: the stem sits mid-glyph.
  const centre =
    measure.width === null ? null : measure.width / 2 - tracking / 2;

  return (
    <View
      testID="clovie-wordmark"
      role="heading"
      aria-level="1"
      accessible
      accessibilityLabel={t('auth.appName')}
      style={{ paddingTop: size * HEADROOM_EM }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: 'row', alignItems: 'baseline' }}
      >
        <Text style={textStyle}>{WORD_START}</Text>
        <View onLayout={onLayout}>
          <Text style={textStyle} onTextLayout={onTextLayout}>
            {DOTLESS_I}
          </Text>
          {centre === null ? null : (
            <View
              testID="clovie-tittle"
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: centre - cloverSize / 2,
                top: stemTop - GAP_EM * size - cloverSize,
              }}
            >
              <Svg width={cloverSize} height={cloverSize} viewBox="0 0 24 24">
                {PETALS.map(([cx, cy, r]) => (
                  <Circle
                    key={`${cx}-${cy}`}
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={BRAND.blue}
                  />
                ))}
              </Svg>
            </View>
          )}
        </View>
        <Text style={textStyle}>{WORD_END}</Text>
      </View>
    </View>
  );
}
