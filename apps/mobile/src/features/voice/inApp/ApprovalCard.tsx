import { Pressable, Text, useDepth } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

const BUTTON_HEIGHT = 52;

/**
 * The raised approval card of the Answer state: the title of what is awaiting a yes, and 52 pt Approve and Decline.
 * It only reports a press; the caller binds it to the approval id the service is holding. The board's second line
 * (date, length, chair) is not drawn: an approval carries a title only, and the title already names all of it.
 */
export function ApprovalCard({
  title,
  onApprove,
  onDecline,
}: {
  title: string;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  return (
    <View
      testID="voice-approval-card"
      style={[{ marginTop: 16, padding: 16, borderRadius: 22 }, depth.hero]}
    >
      <Text
        style={{
          fontSize: 20,
          lineHeight: 26,
          fontWeight: '600',
          color: depth.colors.label,
        }}
      >
        {title}
      </Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('voice.inApp.approve')}
          feedback="nudge"
          pressedScale={1}
          onPress={onApprove}
          style={[
            {
              flex: 1,
              height: BUTTON_HEIGHT,
              borderRadius: BUTTON_HEIGHT / 2,
              alignItems: 'center',
              justifyContent: 'center',
            },
            depth.primary,
          ]}
        >
          <Text
            style={{
              fontSize: 17,
              fontWeight: '600',
              color: depth.colors.onFill,
              textShadowColor: 'rgba(0,0,0,0.12)',
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 0,
            }}
          >
            {t('voice.inApp.approve')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('voice.inApp.decline')}
          feedback="inset"
          pressedScale={1}
          onPress={onDecline}
          style={[
            {
              flex: 1,
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
            {t('voice.inApp.decline')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
