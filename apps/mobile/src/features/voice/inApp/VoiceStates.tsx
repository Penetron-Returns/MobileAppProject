import { Text, useDepth } from '@booking/ui';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import type { InAppVoiceState } from './inAppVoiceState';
import type { LevelStore } from './levelStore';
import { ApprovalCard } from './ApprovalCard';
import { CancelButton, Caption, MicButton, StopButton } from './VoiceControls';
import { Caret, ClovieWithHalo, Orb } from './VoiceParts';
import { VoiceWaveform } from './VoiceWaveform';
import { voiceTokens } from './voiceTokens';

export interface VoiceActions {
  stop: () => void;
  cancel: () => void;
  approve: (id: string) => void;
  decline: (id: string) => void;
  mic: () => void;
  showChat: () => void;
}

interface BodyProps {
  state: InAppVoiceState;
  actions: VoiceActions;
  /** Visible, foreground and Reduce Motion off: the only time anything loops. */
  isLive: boolean;
  bottomInset: number;
}

const BIG_TYPE = {
  fontSize: 28,
  lineHeight: 36,
  letterSpacing: -0.2,
} as const;
const column = (bottomInset: number) =>
  ({
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 20,
    paddingBottom: Math.max(26, bottomInset),
  }) as const;

export function ListeningBody({
  isLive,
  bottomInset,
  actions,
  state,
  levels,
}: BodyProps & { levels: LevelStore }) {
  const { t } = useTranslation();
  const { colors } = useDepth();
  const { accent } = voiceTokens(useDepth());
  return (
    <View style={[column(bottomInset), { alignItems: 'center' }]}>
      <ClovieWithHalo size={76} isLive={isLive} isWorking={false} />
      <Text
        accessibilityLiveRegion="polite"
        style={{
          marginTop: 6,
          fontSize: 17,
          lineHeight: 22,
          fontWeight: '600',
          color: accent,
        }}
      >
        {t('voice.inApp.listening')}
      </Text>
      <View
        style={{ flex: 1, minHeight: 0, alignSelf: 'stretch', marginTop: 12 }}
      >
        <Text
          accessibilityLiveRegion="polite"
          style={{ ...BIG_TYPE, fontWeight: '600', color: colors.label }}
        >
          {state.transcript}
          <Caret isLive={isLive} />
        </Text>
      </View>
      <VoiceWaveform store={levels} isLive={isLive} />
      <View style={{ marginTop: 14 }}>
        <StopButton
          label={t('voice.inApp.stop')}
          onPress={actions.stop}
          isLive={isLive}
        />
      </View>
      <Caption>{t('voice.inApp.stopHint')}</Caption>
    </View>
  );
}

export function ThinkingBody({
  isLive,
  bottomInset,
  actions,
  state,
}: BodyProps) {
  const { t } = useTranslation();
  const { colors, inset } = useDepth();
  return (
    <View style={[column(bottomInset), { alignItems: 'center' }]}>
      <ClovieWithHalo size={76} isLive={isLive} isWorking />
      {state.transcript ? (
        <View
          accessible
          accessibilityLabel={t('voice.inApp.heard', {
            text: state.transcript,
          })}
          style={[
            {
              marginTop: 14,
              maxWidth: '100%',
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: 18,
            },
            inset,
          ]}
        >
          <Text style={{ fontSize: 17, lineHeight: 24, color: colors.label }}>
            {state.transcript}
          </Text>
        </View>
      ) : null}
      <View
        accessibilityLiveRegion="polite"
        style={{
          flex: 1,
          minHeight: 0,
          alignSelf: 'stretch',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
        }}
      >
        <Text
          style={{
            ...BIG_TYPE,
            fontWeight: '700',
            textAlign: 'center',
            color: colors.label,
          }}
        >
          {t('voice.inApp.thinking')}
        </Text>
        <Orb isLive={isLive} />
      </View>
      <CancelButton label={t('voice.inApp.cancel')} onPress={actions.cancel} />
      <Caption>{t('voice.inApp.cancel')}</Caption>
    </View>
  );
}

function useReplyText(state: InAppVoiceState): string {
  const { t } = useTranslation();
  switch (state.replyKind) {
    case 'notHeard':
      return t('voice.inApp.notHeard');
    case 'speechUnavailable':
      return t('voice.inApp.speechUnavailable');
    case 'couldNot':
      return t('voice.inApp.couldNot');
    case 'text':
      return state.reply;
  }
}

export function AnswerBody({ isLive, bottomInset, actions, state }: BodyProps) {
  const { t } = useTranslation();
  const { colors } = useDepth();
  const reply = useReplyText(state);
  const { approval } = state;
  const asksForVoice =
    approval !== null || state.expectsReply || state.replyKind === 'notHeard';
  return (
    <View style={[column(bottomInset), { alignItems: 'stretch' }]}>
      <View style={{ alignSelf: 'center' }}>
        <ClovieWithHalo size={60} isLive={isLive} isWorking={false} />
      </View>
      <Text
        accessibilityLiveRegion="polite"
        style={{
          ...BIG_TYPE,
          marginTop: 12,
          fontWeight: '600',
          color: colors.label,
        }}
      >
        {reply}
      </Text>
      {approval ? (
        <ApprovalCard
          title={approval.title || reply}
          onApprove={() => actions.approve(approval.id)}
          onDecline={() => actions.decline(approval.id)}
        />
      ) : null}
      <View style={{ flex: 1, minHeight: 8 }} />
      {asksForVoice ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
          }}
        >
          <Text
            style={{ fontSize: 15, lineHeight: 20, color: colors.secondary }}
          >
            {t(
              approval ? 'voice.inApp.orSayYesOrNo' : 'voice.inApp.tapToAnswer',
            )}
          </Text>
          <MicButton
            label={t('voice.inApp.mic')}
            onPress={actions.mic}
            isRinging={isLive && state.isListening}
          />
        </View>
      ) : null}
    </View>
  );
}
