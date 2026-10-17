import {
  Group,
  GroupBlock,
  GroupRow,
  ListSkeleton,
  SectionTitle,
  SegmentedControl,
  Text,
  useDepth,
} from '@booking/ui';
import { Check } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useMe } from '@/features/business/me';

import {
  APPROVAL_POLICIES,
  DEFAULT_APPROVAL_POLICY,
  DEFAULT_UNDO_WINDOW_SECONDS,
  UNDO_WINDOW_OPTIONS,
  useCompanionSettings,
  useUpdateCompanionSettings,
  type ApprovalPolicy,
} from '../companionSettings';

const ROOT = 'settings.companionSettings.bookings';

/**
 * Settings > Clovie > "Bookings by Clovie" (owner changes it; staff see it dimmed): how much Clovie asks before it books, moves or cancels, and
 * how long a booking can be undone. A choice saves at once and rolls back with a toast if the save fails. When the
 * settings API cannot be reached (Nerova's is not live yet) the section stays, disabled, saying "Not available yet".
 */
export function BookingsByClovieSection() {
  const { t } = useTranslation();
  const role = useMe().data?.role;
  const isOwner = role === 'owner';
  const settings = useCompanionSettings(isOwner);

  let body: React.ReactNode;
  if (!role) {
    body = <ListSkeleton rows={2} />;
  } else if (!isOwner) {
    body = <Unavailable reason={t('settings.clovie.ownerOnly')} />;
  } else if (settings.isError) {
    body = <Unavailable reason={t(`${ROOT}.unavailable`)} />;
  } else if (settings.isPending) {
    body = <ListSkeleton rows={2} />;
  } else {
    body = (
      <Controls
        policy={settings.data.approvalPolicy ?? DEFAULT_APPROVAL_POLICY}
        undoSeconds={
          settings.data.undoWindowSeconds ?? DEFAULT_UNDO_WINDOW_SECONDS
        }
      />
    );
  }
  return (
    <View testID="bookings-by-clovie">
      <SectionTitle>{t(`${ROOT}.section`)}</SectionTitle>
      {body}
    </View>
  );
}

/** Both rows, shown dimmed and not pressable, each with the reason (not the owner, or the API is not live). */
function Unavailable({ reason }: { reason: string }) {
  const { t } = useTranslation();
  return (
    <Group testID="bookings-unavailable" radius={26}>
      <GroupRow disabled reason={reason} title={t(`${ROOT}.askFirst`)} />
      <GroupRow
        disabled
        showSeparator
        reason={reason}
        title={t(`${ROOT}.undoWindow`)}
      />
    </Group>
  );
}

function Controls({
  policy,
  undoSeconds,
}: {
  policy: ApprovalPolicy;
  undoSeconds: number;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const { update } = useUpdateCompanionSettings();
  // A window the API sent that is not one of the five (set elsewhere) still shows, as its own number.
  const options = UNDO_WINDOW_OPTIONS.includes(
    undoSeconds as (typeof UNDO_WINDOW_OPTIONS)[number],
  )
    ? UNDO_WINDOW_OPTIONS
    : [...UNDO_WINDOW_OPTIONS, undoSeconds].sort((a, b) => a - b);
  return (
    <>
      <Text className="mx-5 mb-2 text-subtitle text-muted-foreground">
        {t(`${ROOT}.askFirst`)}
      </Text>
      <Group radius={26}>
        {APPROVAL_POLICIES.map((value, index) => (
          <GroupRow
            key={value}
            showSeparator={index > 0}
            title={t(`${ROOT}.policy.${value}.title`)}
            detail={
              value === DEFAULT_APPROVAL_POLICY
                ? t(`${ROOT}.recommended`)
                : undefined
            }
            accessibilityLabel={`${t(`${ROOT}.policy.${value}.title`)}. ${t(`${ROOT}.policy.${value}.hint`)}`}
            trailing={
              value === policy ? (
                <Check size={18} strokeWidth={2.6} color={depth.colors.tint} />
              ) : (
                <View style={{ width: 18 }} />
              )
            }
            onPress={() => void update({ approvalPolicy: value })}
          />
        ))}
      </Group>
      <Text
        testID="bookings-policy-hint"
        className="mx-5 mt-2 text-subtitle text-muted-foreground"
      >
        {t(`${ROOT}.policy.${policy}.hint`)}
      </Text>
      <Text className="mx-5 mb-2 mt-5 text-subtitle text-muted-foreground">
        {t(`${ROOT}.undoWindow`)}
      </Text>
      <Group radius={26}>
        <GroupBlock>
          <View className="min-h-14 flex-row items-center px-4 py-2">
            <SegmentedControl<string>
              variant="choice"
              label={t(`${ROOT}.undoWindow`)}
              value={String(undoSeconds)}
              options={options.map((seconds) => ({
                value: String(seconds),
                label:
                  seconds === 0
                    ? t(`${ROOT}.undoOff`)
                    : t(`${ROOT}.undoSeconds`, { seconds }),
              }))}
              onChange={(value) =>
                void update({ undoWindowSeconds: Number(value) })
              }
              className="flex-1"
            />
          </View>
        </GroupBlock>
      </Group>
      <Text className="mx-5 mt-2 text-subtitle text-muted-foreground">
        {t(`${ROOT}.undoHint`)}
      </Text>
    </>
  );
}
