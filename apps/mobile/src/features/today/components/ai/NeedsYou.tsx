import type { AttendanceCheckDTO, AttendanceOutcome } from '@booking/types';
import { Button, Pressable, Surface, Text, useDepth } from '@booking/ui';
import type { Approval } from '@nerova/react-native';
import { Check } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import {
  AttendanceActions,
  AttendanceMoreLink,
} from '@/features/attendance/components/AttendanceActions';
import { mergeNeedsYou, questionValues } from '@/features/attendance/logic';

import { Confirmation, NeedsCard } from './NeedsCard';
import { Tile } from './Tile';

/** The all-clear: a green-tinted card with a check tile. */
function AllClear() {
  const { t } = useTranslation();
  const depth = useDepth();
  const isDark = depth.scheme === 'dark';
  return (
    <View className="px-5 pt-6">
      <Surface
        variant="raised"
        radius={22}
        className="flex-row items-center gap-3 px-4 py-3.5"
      >
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 22,
            backgroundColor: isDark
              ? 'rgba(48,219,91,0.07)'
              : 'rgba(52,199,89,0.07)',
            borderWidth: 1,
            borderColor: isDark
              ? 'rgba(48,219,91,0.25)'
              : 'rgba(36,138,61,0.22)',
          }}
        />
        <Tile
          tone="ok"
          icon={Check}
          size={40}
          iconSize={22}
          strokeWidth={2.6}
        />
        <View className="min-w-0 flex-1">
          <Text className="text-title font-semibold">
            {t('today.ai.needs.none')}
          </Text>
          <Text className="text-subtitle text-muted-foreground">
            {t('today.ai.needs.noneDetail')}
          </Text>
        </View>
      </Surface>
    </View>
  );
}

/**
 * "Needs you": all clear is a quiet line; otherwise one raised amber card
 * showing the first item. Attendance questions come first ("Did Thandi make
 * it to their 14:00 cut?" with Came and No-show), then Clovie's approvals
 * (Approve and Not now). Not now follows the SDK sheet (it keeps the approval
 * waiting, it does not decline it): it moves to the next one, and what is
 * left waiting stays a tap away.
 */
export function NeedsYou({
  pending,
  attendance = [],
  timezone = 'UTC',
  busyId,
  confirmation = null,
  onApprove,
  onAnswerAttendance,
  onOpenAttendance,
  onOpenClovie,
}: {
  pending: readonly Approval[];
  /** Attendance questions waiting for this person, oldest first. */
  attendance?: readonly AttendanceCheckDTO[];
  /** The business timezone, for the time in the attendance question. */
  timezone?: string;
  /** The follow-up line to show instead of the card, if any. */
  confirmation?: string | null;
  /** The approval being approved right now, if any. */
  busyId: string | null;
  onApprove: (id: string) => void;
  onAnswerAttendance?: (
    check: AttendanceCheckDTO,
    outcome: AttendanceOutcome,
  ) => void;
  onOpenAttendance?: () => void;
  onOpenClovie: () => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const [deferred, setDeferred] = React.useState<readonly string[]>([]);
  const open = pending.filter((a) => !deferred.includes(a.id));
  const items = mergeNeedsYou(open, attendance);
  const first = items[0];
  const total = pending.length + attendance.length;
  const waiting = pending.length - open.length;

  if (confirmation) return <Confirmation text={confirmation} />;
  if (total === 0) return <AllClear />;
  if (!first) {
    return (
      <Pressable
        onPress={onOpenClovie}
        accessibilityRole="button"
        accessibilityLabel={t('today.ai.needs.waitingLabel')}
        className="min-h-11 justify-center px-5 pt-3"
      >
        <Text className="text-subtitle text-muted-foreground">
          {t('today.ai.needs.waiting', { count: waiting })}
        </Text>
      </Pressable>
    );
  }
  if (first.kind === 'attendance') {
    return (
      <NeedsCard
        count={total}
        body={t('attendance.question', questionValues(first.check, timezone))}
      >
        <AttendanceActions
          check={first.check}
          onAnswer={(check, outcome) => onAnswerAttendance?.(check, outcome)}
        />
        <AttendanceMoreLink
          count={attendance.length}
          onPress={() => onOpenAttendance?.()}
        />
      </NeedsCard>
    );
  }
  const approval = first.approval;
  const isBusy = busyId === approval.id;
  return (
    <NeedsCard count={total} body={approval.title}>
      <View className="flex-row gap-2.5">
        <Button
          className="flex-1"
          size="lg"
          disabled={isBusy}
          onPress={() => onApprove(approval.id)}
          accessibilityLabel={t('today.ai.needs.approveLabel', {
            title: approval.title,
          })}
          accessibilityState={{ busy: isBusy, disabled: isBusy }}
        >
          <Text className="text-title">{t('today.ai.needs.approve')}</Text>
        </Button>
        <Button
          className="flex-1"
          size="lg"
          variant="secondary"
          disabled={isBusy}
          onPress={() => setDeferred((ids) => [...ids, approval.id])}
          accessibilityLabel={t('today.ai.needs.notNowLabel', {
            title: approval.title,
          })}
        >
          <Text style={{ color: depth.colors.tint }} className="text-title">
            {t('today.ai.needs.notNow')}
          </Text>
        </Button>
      </View>
    </NeedsCard>
  );
}
