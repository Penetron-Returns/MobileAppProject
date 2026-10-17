import { LinearGradient } from 'expo-linear-gradient';
import * as React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Rise } from './Rise';
import type { StoryCardListItem } from './model';

const DOME: [string, string][] = [
  ['#1E9E7A', '#0F6650'],
  ['#1B9494', '#0F6666'],
  ['#2B9A63', '#1B6B43'],
];

/** Raised glass (the board's `cs-raised`) or the solid navy card (`cs-solid`). */
export function Glass({
  style,
  isSolid = false,
  children,
}: {
  style?: ViewStyle;
  isSolid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.glass, isSolid ? styles.solid : null, style]}>
      {isSolid ? null : (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.09)']}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View pointerEvents="none" style={styles.highlight} />
      {children}
    </View>
  );
}

/** A round initials avatar with the board's soft top highlight. */
export function Dome({
  size,
  index,
  text,
  fontSize,
}: {
  size: number;
  index: number;
  text: string;
  fontSize: number;
}) {
  return (
    <View
      style={[
        styles.dome,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <LinearGradient
        colors={DOME[index % DOME.length]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.3)', 'rgba(255,255,255,0)']}
        locations={[0, 0.55]}
        style={StyleSheet.absoluteFill}
      />
      <Text style={[styles.domeText, { fontSize }]}>{text}</Text>
    </View>
  );
}

export function People({ items }: { items: StoryCardListItem[] }) {
  return (
    <View accessibilityRole="list" style={styles.people}>
      {items.map((item, i) => (
        <Rise key={item.name} index={3 + i} style={styles.person}>
          <Dome size={64} index={i} text={item.initials} fontSize={22} />
          <Text numberOfLines={1} style={styles.personName}>
            {item.name.split(' ')[0]}
          </Text>
        </Rise>
      ))}
    </View>
  );
}

export function Rows({ items }: { items: StoryCardListItem[] }) {
  return (
    <Rise index={3}>
      <Glass isSolid style={styles.rows}>
        {items.map((item) => (
          <View key={item.name} style={styles.row}>
            <Dome size={40} index={0} text={item.initials} fontSize={15} />
            <View style={styles.rowText}>
              <Text numberOfLines={1} style={styles.rowName}>
                {item.name}
              </Text>
              <Text numberOfLines={1} style={styles.rowDetail}>
                {item.detail}
              </Text>
            </View>
          </View>
        ))}
      </Glass>
    </Rise>
  );
}

const TIME = /\d{1,2}:\d{2}/;

/** One item: a time (when `initials` carries one) or an avatar, then name and detail. */
export function Detail({
  item,
  accent,
}: {
  item: StoryCardListItem;
  accent: string;
}) {
  const hasTime = TIME.test(item.initials);
  return (
    <Rise index={3}>
      <Glass style={styles.detail}>
        {hasTime ? (
          <Text style={[styles.detailTime, { color: accent }]}>
            {item.initials}
          </Text>
        ) : (
          <Dome size={40} index={0} text={item.initials} fontSize={15} />
        )}
        <View style={styles.rowText}>
          <Text numberOfLines={1} style={styles.detailName}>
            {item.name}
          </Text>
          <Text style={styles.rowDetail}>{item.detail}</Text>
        </View>
      </Glass>
    </Rise>
  );
}

export function Summary({
  items,
  accent,
}: {
  items: StoryCardListItem[];
  accent: string;
}) {
  return (
    <View accessibilityRole="list" style={styles.summary}>
      {items.map((item, i) => (
        <Rise key={item.name} index={3 + i}>
          <Glass style={styles.summaryRow}>
            <View style={[styles.check, { backgroundColor: `${accent}33` }]}>
              <Svg width={22} height={22} viewBox="0 0 24 24">
                <Path
                  d="M5 12.5l4.5 4.5L19 7.5"
                  fill="none"
                  stroke={accent}
                  strokeWidth={2.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </View>
            <View style={styles.rowText}>
              <Text style={styles.summaryTitle}>{item.name}</Text>
              <Text style={styles.rowDetail}>{item.detail}</Text>
            </View>
          </Glass>
        </Rise>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  glass: {
    overflow: 'hidden',
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 8,
        blurRadius: 18,
        spreadDistance: -6,
        color: 'rgba(0,0,0,0.4)',
      },
    ],
  },
  solid: { backgroundColor: '#143A52' },
  highlight: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dome: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  domeText: { fontWeight: '600', color: '#FFFFFF' },
  people: { flexDirection: 'row', gap: 14 },
  person: { width: 100, alignItems: 'center', gap: 8 },
  personName: {
    width: 100,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.86)',
  },
  rows: { paddingVertical: 8, paddingHorizontal: 14, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58 },
  rowText: { flex: 1, minWidth: 0 },
  rowName: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  rowDetail: {
    fontSize: 15,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.72)',
  },
  detail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  detailTime: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  detailName: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  summary: { gap: 10 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 76,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  check: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitle: {
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
