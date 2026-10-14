import { useUser } from '@clerk/expo';
import * as React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  FlowFooter,
  FlowHeading,
  FlowTopBar,
} from '@/components/flow/FlowChrome';
import { Ground } from '@/components/Ground';
import { ErrorState } from '@/components/States';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useDepth } from '@/hooks/useDepth';

import { useCompleteOnboarding } from '../hooks';
import {
  addTeamMember,
  buildOnboardingRequest,
  canContinue,
  canGoBack,
  canSkip,
  initialDraft,
  nextStep,
  prevStep,
  removeTeamMember,
  selectType,
  setPrice,
  STEP_COUNT,
  STEP_HEADINGS,
  toggleDay,
  toggleService,
  type OnboardingDraft,
  type Step,
} from '../logic';
import {
  DoneStep,
  HoursStep,
  ServicesStep,
  TeamStep,
  TypeStep,
  type StepActions,
} from './OnboardingSteps';

/**
 * The first-run flow for a signed-in user with no business: type, name and
 * hours, services, team (skippable), done. Creates the Clerk organisation and
 * the business at the end of the team step; `onDone` leaves for Today.
 */
export function OnboardingFlow({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const depth = useDepth();
  const { user } = useUser();
  const ownerName = user?.fullName ?? user?.firstName ?? null;
  const [step, setStep] = React.useState<Step>(1);
  const [draft, setDraft] = React.useState<OnboardingDraft>(initialDraft);
  const submit = useCompleteOnboarding();

  const update = React.useCallback(
    (fn: (d: OnboardingDraft) => OnboardingDraft) => setDraft(fn),
    [],
  );
  const actions: StepActions = React.useMemo(
    () => ({
      selectType: (id) => update((d) => selectType(d, id)),
      setName: (name) => update((d) => ({ ...d, businessName: name })),
      toggleDay: (id) => update((d) => toggleDay(d, id)),
      toggleService: (name) => update((d) => toggleService(d, name)),
      setPrice: (name, text) => update((d) => setPrice(d, name, text)),
      addMember: (name, title) => update((d) => addTeamMember(d, name, title)),
      removeMember: (i) => update((d) => removeTeamMember(d, i)),
    }),
    [update],
  );

  const finish = async (skipTeam: boolean) => {
    const source = skipTeam ? { ...draft, team: [] } : draft;
    if (skipTeam) setDraft(source);
    try {
      await submit.mutateAsync(buildOnboardingRequest(source, ownerName));
      setStep(STEP_COUNT);
    } catch {
      // Shown inline via submit.error; the same payload retries with the same key.
    }
  };

  const onPrimary = () => {
    if (step === 4) void finish(false);
    else if (step === STEP_COUNT) onDone();
    else setStep(nextStep(step));
  };

  const isDone = step === STEP_COUNT;
  const heading = isDone ? null : STEP_HEADINGS[step as 1 | 2 | 3 | 4];
  const primaryLabel = isDone ? 'Go to Today' : 'Continue';

  return (
    <Ground className="flex-1">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{
            paddingTop: insets.top + 58,
            paddingBottom: 190,
          }}
        >
          <View className="w-full max-w-2xl self-center">
            {heading ? (
              <View className="px-5 pb-6 pt-2">
                <FlowHeading
                  title={heading.title}
                  subtitle={heading.subtitle}
                />
              </View>
            ) : null}
            {step === 1 ? <TypeStep draft={draft} actions={actions} /> : null}
            {step === 2 ? <HoursStep draft={draft} actions={actions} /> : null}
            {step === 3 ? (
              <ServicesStep draft={draft} actions={actions} />
            ) : null}
            {step === 4 ? (
              <>
                <TeamStep
                  draft={draft}
                  actions={actions}
                  ownerName={ownerName}
                />
                {submit.error ? (
                  <View className="mx-5 mt-4">
                    <ErrorState
                      error={submit.error}
                      onRetry={() => void finish(false)}
                    />
                  </View>
                ) : null}
              </>
            ) : null}
            {isDone ? <DoneStep draft={draft} /> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <FlowTopBar
        value={step}
        max={STEP_COUNT}
        progressLabel="Setup progress"
        showBack={canGoBack(step) && !submit.isPending}
        onBack={() => setStep(prevStep(step))}
      />
      <FlowFooter>
        <Button
          size="lg"
          className="h-14 rounded-[28px]"
          disabled={!canContinue(step, draft) || submit.isPending}
          onPress={onPrimary}
          accessibilityLabel={primaryLabel}
          accessibilityState={{
            disabled: !canContinue(step, draft) || submit.isPending,
            busy: submit.isPending,
          }}
        >
          {submit.isPending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="text-title font-semibold">{primaryLabel}</Text>
          )}
        </Button>
        {canSkip(step) ? (
          <Button
            variant="ghost"
            className="mt-1.5 h-12 rounded-full"
            disabled={submit.isPending}
            onPress={() => void finish(true)}
            accessibilityLabel="Do this later"
          >
            <Text style={{ color: depth.colors.tint }} className="text-title">
              Do this later
            </Text>
          </Button>
        ) : null}
      </FlowFooter>
    </Ground>
  );
}
