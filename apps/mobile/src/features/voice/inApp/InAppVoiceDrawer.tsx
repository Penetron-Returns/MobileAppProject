import { Pressable, Text, useDepth } from '@booking/ui';
import { MessageSquare } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMotionActive } from '@/hooks/useMotionActive';

import { drawerHeightFraction, type InAppVoiceState } from './inAppVoiceState';
import type { LevelStore } from './levelStore';
import {
  AnswerBody,
  ListeningBody,
  ThinkingBody,
  type VoiceActions,
} from './VoiceStates';
import { VoiceGlow, type GlowMode } from './VoiceGlow';
import { ReadingChip } from './VoiceParts';
import { voiceTokens } from './voiceTokens';

/** The board's drawer corner radius. */
const TOP_RADIUS = 20;

interface DrawerProps {
  state: InAppVoiceState;
  levels: LevelStore;
  actions: VoiceActions;
  /** The clock for the undo countdown (tests inject it). */
  now?: () => number;
}

const glowMode = (phase: InAppVoiceState['phase']): GlowMode =>
  phase === 'thinking'
    ? 'thinking'
    : phase === 'answer'
      ? 'answer'
      : 'listening';

/**
 * The companion drawer in voice mode (boards VoiceInAppScreen / VoiceInApp): a dim over the app and a bottom drawer
 * with Clovie, the live words and level, and the controls. Listening and Thinking are 62% of the screen, an Answer
 * with an approval card is taller. "Show chat" hands over to the normal chat sheet. Mounted only while voice is open,
 * and everything that loops is gated on `useMotionActive`, so a closed, hidden or Reduce Motion drawer draws nothing.
 */
export function InAppVoiceDrawer({ state, levels, actions, now }: DrawerProps) {
  const { t } = useTranslation();
  const depth = useDepth();
  const tokens = voiceTokens(depth);
  const isLive = useMotionActive();
  const insets = useSafeAreaInsets();
  const { height: screen } = useWindowDimensions();
  const height = Math.min(
    Math.round(screen * drawerHeightFraction(state)),
    screen - insets.top - 8,
  );
  const { phase } = state;
  if (phase === 'closed') return null;
  return (
    <View
      testID="voice-drawer-layer"
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
    >
      {/* The dim swallows touches so the app underneath cannot be used while Clovie listens. */}
      <View
        testID="voice-dim"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onStartShouldSetResponder={() => true}
        style={[StyleSheet.absoluteFill, { backgroundColor: tokens.dim }]}
      />
      <View
        testID="voice-drawer"
        accessibilityViewIsModal
        accessibilityLabel={t('voice.inApp.dialog')}
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height,
            borderTopLeftRadius: TOP_RADIUS,
            borderTopRightRadius: TOP_RADIUS,
            boxShadow: depth.sheet.boxShadow,
          },
        ]}
      >
        <View
          style={[
            {
              flex: 1,
              overflow: 'hidden',
              borderTopLeftRadius: TOP_RADIUS,
              borderTopRightRadius: TOP_RADIUS,
            },
            tokens.drawer,
          ]}
        >
          <VoiceGlow mode={glowMode(phase)} isLive={isLive} />
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              height: 32,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: 36,
                height: 5,
                borderRadius: 3,
                backgroundColor: depth.grabber,
                boxShadow: `inset 0 1px 1px rgba(16,24,40,0.2), 0 1px 0 ${tokens.grabLip}`,
              }}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('voice.inApp.showChat')}
            feedback="dim"
            onPress={actions.showChat}
            style={{
              position: 'absolute',
              right: 12,
              top: 4,
              zIndex: 3,
              minHeight: 44,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 10,
            }}
          >
            <MessageSquare
              size={20}
              strokeWidth={1.8}
              color={depth.colors.tint}
            />
            <Text
              style={{
                fontSize: 17,
                lineHeight: 22,
                fontWeight: '600',
                color: depth.colors.tint,
              }}
            >
              {t('voice.inApp.showChat')}
            </Text>
          </Pressable>
          {phase === 'answer' && state.isReading ? <ReadingChip /> : null}
          {phase === 'listening' ? (
            <ListeningBody
              state={state}
              levels={levels}
              actions={actions}
              isLive={isLive}
              bottomInset={insets.bottom}
            />
          ) : null}
          {phase === 'thinking' ? (
            <ThinkingBody
              state={state}
              actions={actions}
              isLive={isLive}
              bottomInset={insets.bottom}
            />
          ) : null}
          {phase === 'answer' ? (
            <AnswerBody
              state={state}
              actions={actions}
              now={now}
              isLive={isLive}
              bottomInset={insets.bottom}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}
