import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  AttendanceActions,
  AttendanceMoreLink,
} from '@/features/attendance/components/AttendanceActions';
import { useAttendance } from '@/features/attendance/hooks';
import { questionValues } from '@/features/attendance/logic';

import { Confirmation, NeedsCard } from './ai/NeedsCard';

/**
 * The attendance question on the classic Today (plans without the companion):
 * the same amber card as the AI home, and nothing at all when nobody is waiting.
 */
export function AttendanceNeeds({ timezone }: { timezone: string }) {
  const { t } = useTranslation();
  const attendance = useAttendance();
  const first = attendance.checks[0];
  if (attendance.confirmation) {
    return <Confirmation text={attendance.confirmation} />;
  }
  if (!first) return null;
  return (
    <NeedsCard
      count={attendance.checks.length}
      body={t('attendance.question', questionValues(first, timezone))}
    >
      <AttendanceActions
        check={first}
        onAnswer={(check, outcome) => void attendance.answer(check, outcome)}
      />
      <AttendanceMoreLink
        count={attendance.checks.length}
        onPress={() => router.push('/attendance' as never)}
      />
    </NeedsCard>
  );
}
