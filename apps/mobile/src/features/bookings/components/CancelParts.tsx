import { Button, DoneCard, Surface, Text, useDepth } from '@booking/ui';
import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

/** What the done card says, fixed at the moment the owner confirmed. */
export interface CancelOutcome {
  name: string;
  notify: boolean;
  isLate: boolean;
}

export function CancelDone({
  appointmentId,
  outcome,
}: {
  appointmentId: string;
  outcome: CancelOutcome;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <View>
      <DoneCard
        title={t('cancel.done')}
        lines={[
          outcome.notify
            ? t('cancel.told', { name: outcome.name })
            : t('cancel.notTold'),
          ...(outcome.isLate ? [t('cancel.recordedLate')] : []),
        ]}
      />
      <Button
        size="lg"
        className="mt-8"
        onPress={() => router.replace(`/bookings/${appointmentId}` as never)}
      >
        <Text className="text-title">{t('common.done')}</Text>
      </Button>
    </View>
  );
}

export function ReasonRow({
  label,
  selected,
  showSeparator,
  onPress,
}: {
  label: string;
  selected: boolean;
  showSeparator: boolean;
  onPress: () => void;
}) {
  const depth = useDepth();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      className="min-h-14 flex-row items-center justify-between px-4 active:bg-muted"
    >
      {showSeparator ? (
        <Surface
          variant="engrave"
          className="absolute left-4 right-0 top-0 h-0.5"
        />
      ) : null}
      <Text className="text-title">{label}</Text>
      {selected ? (
        <Check size={20} strokeWidth={2.6} color={depth.colors.tint} />
      ) : null}
    </Pressable>
  );
}
