import { useReduceMotion } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Platform, TextInput, View } from 'react-native';

import { NAME_MAX, type BusinessTypeId } from '../logic';
import { TYPE, useOnbColors } from '../theme';
import { ClovieReaction } from './ClovieReaction';
import { Heading } from './Heading';
import { OnbButton } from './OnbButton';
import { OnboardingShell } from './OnboardingShell';
import { Rise } from './Rise';
import { StreamedText } from './StreamedText';

const WORD_MS = 90;
const SHOW_EVENT =
  Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';

/** True from the first time the keyboard opens: the boards' compact layout (Clovie 64, short title). */
function useKeyboardOpened(): boolean {
  const [opened, setOpened] = React.useState(false);
  React.useEffect(() => {
    const sub = Keyboard.addListener(SHOW_EVENT, () => setOpened(true));
    return () => sub.remove();
  }, []);
  return opened;
}

/**
 * Board 3: "{Type}. Lovely! What's it called?" with a big underline field. The
 * greeting streams in word by word while Clovie hops; then the field takes
 * focus, the keyboard rises, Clovie shrinks and Continue lifts above it. Until
 * there is a name, Continue stays flat grey.
 */
export function NameScreen({
  typeId,
  name,
  onChangeName,
  onContinue,
  onBack,
  isBusy = false,
}: {
  typeId: BusinessTypeId;
  name: string;
  onChangeName: (name: string) => void;
  onContinue: () => void;
  onBack: () => void;
  isBusy?: boolean;
}) {
  const { t } = useTranslation();
  const c = useOnbColors();
  const isReduced = useReduceMotion();
  const inputRef = React.useRef<TextInput>(null);
  const isCompact = useKeyboardOpened();
  const canContinue = name.trim().length > 0 && !isBusy;

  const greeting = `${t('onboarding.name.lovely', {
    type: t(`onboarding.types.${typeId}`),
  })}\n${t('onboarding.name.title')}`;

  // Focus once the greeting has been said, so the keyboard does not cut it off.
  React.useEffect(() => {
    if (isBusy) return;
    const words = greeting.split(/\s+/).length;
    const id = setTimeout(
      () => inputRef.current?.focus(),
      isReduced ? 0 : words * WORD_MS + 200,
    );
    return () => clearTimeout(id);
  }, [greeting, isReduced, isBusy]);

  const submit = () => {
    if (canContinue) onContinue();
  };

  return (
    <OnboardingShell
      stage={2}
      onBack={isBusy ? undefined : onBack}
      spoken={greeting.replace('\n', ' ')}
      footerBottom={isCompact ? 12 : 34}
      footer={
        <OnbButton
          label={t('onboarding.continue')}
          onPress={submit}
          disabled={!canContinue}
          loading={isBusy}
        />
      }
    >
      <View
        style={{
          flex: 1,
          alignItems: 'flex-start',
          gap: isCompact ? 14 : 16,
          paddingHorizontal: 20,
          paddingTop: 4,
        }}
      >
        <View style={{ marginTop: isCompact ? 0 : 12 }}>
          <ClovieReaction
            mood={isCompact ? 'calm' : 'delighted'}
            size={isCompact ? 64 : 96}
            sparkles={!isCompact}
          />
        </View>
        {isCompact ? (
          <Heading>{t('onboarding.name.title')}</Heading>
        ) : (
          <StreamedText text={greeting} />
        )}
        <Rise index={2} style={{ alignSelf: 'stretch' }}>
          <View
            style={{
              paddingTop: 8,
              paddingBottom: 10,
              borderBottomWidth: 2,
              borderBottomColor: c.tint,
            }}
          >
            <TextInput
              ref={inputRef}
              value={name}
              onChangeText={onChangeName}
              placeholder={t('onboarding.name.placeholder')}
              placeholderTextColor={c.placeholder}
              accessibilityLabel={t('onboarding.name.label')}
              autoCapitalize="words"
              autoComplete="organization"
              autoCorrect={false}
              maxLength={NAME_MAX}
              returnKeyType="done"
              onSubmitEditing={submit}
              editable={!isBusy}
              selectionColor={c.tint}
              style={[TYPE.hero, { height: 44, padding: 0, color: c.label }]}
            />
          </View>
        </Rise>
      </View>
    </OnboardingShell>
  );
}
