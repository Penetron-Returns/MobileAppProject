import { Pressable, Text, useDepth } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useUndoCountdown } from './useUndoCountdown';

const BUTTON_HEIGHT = 52;

export interface BookedLine {
  label: string;
  from: string | null;
  to: string;
}

/**
 * The calm confirmation of the Answer state after Clovie acted by itself (act-then-undo): "Booked", what was done as
 * label and value lines, and a 52 pt secondary Undo button while the window is open. The countdown is a static label
 * that changes once a second only while it is shown; once the window closes the button goes and nothing ticks. It only
 * reports a press; the caller binds it to the action id the service is holding.
 */
export function BookedCard({
  lines,
  undoUntilMs,
  now,
  onUndo,
}: {
  lines: readonly BookedLine[];
  undoUntilMs: number;
  now?: () => number;
  onUndo: () => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const seconds = useUndoCountdown(undoUntilMs, now);
  return (
    <View
      testID="voice-booked-card"
      style={[{ marginTop: 16, padding: 16, borderRadius: 22 }, depth.hero]}
    >
      <Text
        style={{
          fontSize: 13,
          lineHeight: 18,
          fontWeight: '700',
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          color: depth.colors.success,
        }}
      >
        {t('voice.inApp.booked')}
      </Text>
      {lines.map((line) => (
        <View key={line.label} style={{ marginTop: 8 }}>
          <Text
            style={{
              fontSize: 13,
              lineHeight: 18,
              color: depth.colors.secondary,
            }}
          >
            {line.label}
          </Text>
          <Text
            style={{
              fontSize: 17,
              lineHeight: 22,
              fontWeight: '600',
              color: depth.colors.label,
            }}
          >
            {line.from
              ? t('voice.inApp.lineMoved', { from: line.from, to: line.to })
              : line.to}
          </Text>
        </View>
      ))}
      {seconds > 0 ? (
        <Pressable
          testID="voice-undo"
          accessibilityRole="button"
          accessibilityLabel={t('voice.inApp.undoLabel', { seconds })}
          feedback="inset"
          pressedScale={1}
          onPress={onUndo}
          style={[
            {
              marginTop: 14,
              height: BUTTON_HEIGHT,
              borderRadius: BUTTON_HEIGHT / 2,
              alignItems: 'center',
              justifyContent: 'center',
            },
            depth.button,
          ]}
        >
          <Text
            style={{
              fontSize: 17,
              fontWeight: '600',
              color: depth.colors.tint,
            }}
          >
            {t('voice.inApp.undo', { seconds })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
