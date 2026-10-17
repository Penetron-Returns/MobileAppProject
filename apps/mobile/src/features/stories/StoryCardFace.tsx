import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { Detail, People, Rows, Summary } from './cardVisuals';
import { NamesDemo, UndoDemo } from './demos';
import { layoutForCard } from './layout';
import type { StoryCard, StoryKind } from './model';
import { NumberLine } from './NumberLine';
import { Rise } from './Rise';
import { TONES } from './tones';

interface StoryCardFaceProps {
  card: StoryCard;
  kind: StoryKind;
  /** True for the card on screen: demos run only then. */
  isCurrent: boolean;
}

/**
 * One card: kicker, number, headline, body and the card's visual, each
 * staggered in. Memoised on (card, kind, isCurrent), so a progress tick or a
 * transition never re-renders it.
 */
export const StoryCardFace = React.memo(function StoryCardFace({
  card,
  kind,
  isCurrent,
}: StoryCardFaceProps) {
  const { t } = useTranslation();
  const layout = React.useMemo(() => layoutForCard(card, kind), [card, kind]);
  const accent = TONES[card.tone].accent;
  const lineHeight = Math.round(layout.headlineSize * 1.16);
  const list = card.list ?? [];
  const hasKickerRow = layout.hasBadge || card.kicker !== '';
  return (
    <View style={styles.column}>
      {hasKickerRow ? (
        <Rise index={0} style={styles.kickerRow}>
          {layout.hasBadge ? (
            <View style={[styles.badge, { backgroundColor: accent }]}>
              <Text style={styles.badgeText}>{t('stories.badgeNew')}</Text>
            </View>
          ) : null}
          {card.kicker !== '' ? (
            <Text style={[styles.kicker, { color: accent }]}>
              {card.kicker}
            </Text>
          ) : null}
        </Rise>
      ) : null}
      {card.number ? (
        <NumberLine
          number={card.number}
          accent={accent}
          hasPush={layout.hasNumberPush}
        />
      ) : null}
      <Rise index={1} style={styles.headline}>
        <Text
          accessibilityRole="header"
          style={[
            styles.headlineText,
            {
              fontSize: layout.headlineSize,
              lineHeight,
              width: layout.headlineWidth ?? undefined,
            },
          ]}
        >
          {card.headline}
        </Text>
      </Rise>
      {card.body ? (
        <Rise index={2} style={styles.body}>
          <Text style={styles.bodyText}>{card.body}</Text>
        </Rise>
      ) : null}
      <View
        style={layout.visual === 'people' ? styles.visualWide : styles.visual}
      >
        {layout.visual === 'detail' ? (
          <Detail item={list[0]} accent={accent} />
        ) : null}
        {layout.visual === 'people' ? <People items={list} /> : null}
        {layout.visual === 'rows' ? <Rows items={list} /> : null}
        {layout.visual === 'summary' ? (
          <Summary items={list} accent={accent} />
        ) : null}
        {layout.visual === 'undo' ? <UndoDemo isRunning={isCurrent} /> : null}
        {layout.visual === 'names' ? <NamesDemo isRunning={isCurrent} /> : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  column: { flex: 1 },
  kickerRow: {
    height: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    paddingVertical: 2,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: '#0A1A28',
  },
  kicker: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  headline: { marginTop: 8 },
  headlineText: {
    fontWeight: '700',
    letterSpacing: -0.4,
    color: '#FFFFFF',
  },
  body: { marginTop: 10 },
  bodyText: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.78)',
  },
  visual: { marginTop: 36 },
  visualWide: { marginTop: 48 },
});
