import { Button, ErrorState, LabeledInsetField, Text } from '@booking/ui';
import { useUser } from '@clerk/expo';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ClovieLoading } from '@/features/brand/ClovieLoading';
import { describeError } from '@/lib/toast';

import { useCompleteOnboarding } from '../hooks';
import {
  buildOnboardingRequest,
  canGoBack,
  canSubmit,
  goBack,
  initialDraft,
  selectType,
  setName,
  type OnboardingDraft,
} from '../logic';
import { clearDraft, loadDraft, saveDraft } from '../storage';
import { OnboardingFrame } from './OnboardingFrame';
import { TypeStep } from './TypeStep';

/**
 * The first-run flow for a signed-in user with no business: two questions
 * (type, then name). Continue on the name creates the Clerk organisation and
 * the business from the type's template, then `onDone` hands over to the plan
 * screen. The draft is kept in secure storage, so a killed app resumes.
 */
export function OnboardingFlow({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { user } = useUser();
  const ownerName = user?.fullName ?? user?.firstName ?? null;
  const [draft, setDraft] = React.useState<OnboardingDraft | null>(null);
  const submit = useCompleteOnboarding();

  React.useEffect(() => {
    let alive = true;
    void loadDraft().then((stored) => {
      if (alive) setDraft(stored);
    });
    return () => {
      alive = false;
    };
  }, []);

  const update = React.useCallback(
    (fn: (d: OnboardingDraft) => OnboardingDraft) =>
      setDraft((current) => {
        const next = fn(current ?? initialDraft());
        void saveDraft(next);
        return next;
      }),
    [],
  );

  if (!draft) return <ClovieLoading />;

  const finish = async () => {
    const request = buildOnboardingRequest(draft, ownerName);
    if (!request) return;
    try {
      await submit.mutateAsync(request);
      await clearDraft();
      onDone();
    } catch {
      // Shown inline via submit.error; the same payload retries with the same key.
    }
  };

  if (draft.step === 1) {
    return (
      <OnboardingFrame stage={1} title={t('onboarding.type.title')}>
        <TypeStep
          selected={draft.typeId}
          onSelect={(id) => update((d) => selectType(d, id))}
        />
      </OnboardingFrame>
    );
  }

  const ready = canSubmit(draft) && !submit.isPending;
  return (
    <OnboardingFrame
      stage={2}
      title={t('onboarding.name.title')}
      showBack={canGoBack(draft) && !submit.isPending}
      onBack={() => update(goBack)}
      footer={
        <Button
          size="xl"
          loading={submit.isPending}
          disabled={!ready}
          onPress={() => void finish()}
          accessibilityLabel={t('onboarding.continue')}
        >
          <Text>{t('onboarding.continue')}</Text>
        </Button>
      }
    >
      <View className="mx-5">
        <LabeledInsetField
          label={t('onboarding.name.label')}
          value={draft.businessName}
          onChangeText={(name) => update((d) => setName(d, name))}
          placeholder={t('onboarding.name.placeholder')}
          autoCapitalize="words"
          autoComplete="organization"
          autoFocus
          maxLength={120}
          returnKeyType="done"
          onSubmitEditing={() => ready && void finish()}
          editable={!submit.isPending}
        />
        <Text className="mt-3 text-subtitle text-muted-foreground">
          {t('onboarding.name.micTip')}
        </Text>
      </View>
      {submit.error ? (
        <View className="mx-5 mt-4">
          <ErrorState
            variant="banner"
            {...describeError(submit.error)}
            onRetry={() => void finish()}
          />
        </View>
      ) : null}
    </OnboardingFrame>
  );
}
