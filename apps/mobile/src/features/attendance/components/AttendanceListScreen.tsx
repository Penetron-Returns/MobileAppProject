import type { AttendanceCheckDTO } from '@booking/types';
import {
  EmptyState,
  ErrorState,
  Group,
  GroupBlock,
  ListSkeleton,
  Page,
  Text,
} from '@booking/ui';
import { Check } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useBusiness } from '@/features/business/hooks';
import { formatTime } from '@/lib/time';
import { describeError } from '@/lib/toast';

import { useAttendance } from '../hooks';
import { AttendanceActions } from './AttendanceActions';

function Row({
  check,
  timezone,
  showSeparator,
  onAnswer,
}: {
  check: AttendanceCheckDTO;
  timezone: string;
  showSeparator: boolean;
  onAnswer: React.ComponentProps<typeof AttendanceActions>['onAnswer'];
}) {
  const { t } = useTranslation();
  return (
    <GroupBlock showSeparator={showSeparator} className="px-4 py-3">
      <Text className="text-title font-semibold">
        {check.client_first_name}
      </Text>
      <Text className="mb-2.5 text-subtitle text-muted-foreground">
        {t('attendance.list.row', {
          time: formatTime(check.starts_at, timezone),
          service: check.service_name,
        })}
      </Text>
      <AttendanceActions check={check} size="default" onAnswer={onAnswer} />
    </GroupBlock>
  );
}

/** Every open attendance question, oldest first, each answerable in place. */
export function AttendanceListScreen() {
  const { t } = useTranslation();
  const business = useBusiness();
  const attendance = useAttendance();
  const timezone = business.data?.timezone ?? 'UTC';

  let body: React.ReactNode;
  if (attendance.isError && attendance.checks.length === 0) {
    body = (
      <ErrorState
        variant="banner"
        {...describeError(attendance.error)}
        onRetry={() => void attendance.refetch()}
      />
    );
  } else if (attendance.isLoading) {
    body = <ListSkeleton rows={3} />;
  } else if (attendance.checks.length === 0) {
    body = (
      <EmptyState
        icon={Check}
        title={attendance.confirmation ?? t('attendance.list.emptyTitle')}
        description={
          attendance.confirmation
            ? undefined
            : t('attendance.list.emptyDescription')
        }
      />
    );
  } else {
    body = (
      <>
        <Group className="mt-5" radius={22}>
          {attendance.checks.map((check, i) => (
            <Row
              key={check.id}
              check={check}
              timezone={timezone}
              showSeparator={i > 0}
              onAnswer={(c, outcome) => void attendance.answer(c, outcome)}
            />
          ))}
        </Group>
        {attendance.confirmation ? (
          <View accessibilityLiveRegion="polite">
            <Text className="mx-5 mt-3 text-subtitle text-muted-foreground">
              {attendance.confirmation}
            </Text>
          </View>
        ) : null}
      </>
    );
  }

  return (
    <Page
      title={t('attendance.list.title')}
      backLabel={t('attendance.list.back')}
      backFallback="/"
      onRefresh={attendance.refetch}
    >
      {body}
    </Page>
  );
}
