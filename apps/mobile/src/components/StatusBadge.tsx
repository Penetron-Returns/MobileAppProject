import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui/text';
import type { AppointmentStatus } from '@shared/api';
import { cn } from '@/lib/utils';

const STYLES: Record<
  AppointmentStatus,
  { box: string; text: string; dot: string }
> = {
  confirmed: {
    box: 'bg-status-confirmed-soft',
    text: 'text-status-confirmed',
    dot: 'bg-status-confirmed',
  },
  completed: {
    box: 'bg-status-completed-soft',
    text: 'text-status-completed',
    dot: 'bg-status-completed',
  },
  cancelled: {
    box: 'bg-status-cancelled-soft',
    text: 'text-status-cancelled',
    dot: 'bg-status-cancelled',
  },
  no_show: {
    box: 'bg-status-pending-soft',
    text: 'text-status-pending',
    dot: 'bg-status-pending',
  },
};

/** Uppercase status chip for an appointment's lifecycle status. `pill` adds a leading dot. */
export function StatusBadge({
  status,
  pill,
  className,
}: {
  status: AppointmentStatus;
  pill?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const s = STYLES[status];
  return (
    <View
      accessibilityRole="text"
      className={cn(
        'flex-row items-center gap-1.5 self-start rounded-full',
        pill ? 'px-4 py-1.5' : 'px-2 py-0.5',
        s.box,
        className,
      )}
    >
      {pill ? <View className={cn('h-2 w-2 rounded-full', s.dot)} /> : null}
      <Text
        className={cn(
          'font-bold uppercase tracking-wide',
          pill ? 'text-xs' : 'text-[10px]',
          s.text,
        )}
      >
        {t(`status.${status}`)}
      </Text>
    </View>
  );
}
