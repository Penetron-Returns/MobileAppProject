import type { StaffBreakDTO, StaffTimeOffDTO } from '@booking/types';
import { ConfirmDialog } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  breakTimes,
  sortBreaks,
  weekdaysLabel,
} from '@/features/availability/breaks';
import {
  useAvailabilityConfig,
  useDeleteTimeOff,
  useReplaceStaffBreaks,
  useUpcomingWindow,
} from '@/features/availability/hooks';
import { timeOffRange, upcomingTimeOff } from '@/features/availability/timeOff';
import {
  toStaffWeek,
  toWeekSchedule,
  type DayHours,
} from '@/features/availability/week';
import { breaksWithout } from '@/features/availability/breaks';
import { toast } from '@/lib/toast';

import {
  dayHours,
  weekdayName,
  workingDaysSummary,
  type BusinessHoursRule,
  type WorkingDay,
} from '../schedule';
import { BreakSheet } from './BreakSheet';
import { ScheduleSection, type SectionLine } from './ScheduleSection';
import { TimeOffSheet } from './TimeOffSheet';
import { WorkingHoursSheet } from './WorkingHoursSheet';

type SectionId = 'hours' | 'breaks' | 'off';
type Sheet =
  | { kind: 'hours' }
  | { kind: 'break'; item: StaffBreakDTO | null }
  | { kind: 'off'; item: StaffTimeOffDTO | null };
type Deleting =
  | { kind: 'break'; item: StaffBreakDTO }
  | { kind: 'off'; item: StaffTimeOffDTO };

/** The "more" count of a summary: "Lunch 13:00 to 13:30, +1 more". */
function withMore(first: string, count: number, more: string) {
  return count > 1 ? `${first}, ${more}` : first;
}

/**
 * The three expandable sections of a person's card (Working days, Breaks,
 * Time off) with their editors, per the Staff board. One section is open at a
 * time. The editors are sheets, so the page reports when one is up.
 */
export function PersonSchedule({
  staffId,
  week,
  inherited,
  rules,
  businessHours,
  onPresentChange,
}: {
  staffId: string;
  week: WorkingDay[];
  inherited: boolean;
  rules: { weekday: number; start_time: string; end_time: string }[];
  businessHours: BusinessHoursRule[];
  onPresentChange: (active: boolean) => void;
}) {
  const { t } = useTranslation();
  const to = t('team.to');
  const window = useUpcomingWindow();
  const config = useAvailabilityConfig(
    window?.from ?? '',
    window?.to ?? '',
    window !== null,
  );
  const mine = config.data?.staff.find((s) => s.staff_id === staffId);
  const breaks = sortBreaks(mine?.breaks ?? []);
  const timeOff = window
    ? upcomingTimeOff(mine?.time_off ?? [], window.today)
    : [];

  const [open, setOpen] = React.useState<SectionId | null>(null);
  const [sheet, setSheet] = React.useState<Sheet | null>(null);
  const [deleting, setDeleting] = React.useState<Deleting | null>(null);
  React.useEffect(() => {
    onPresentChange(sheet !== null);
  }, [sheet, onPresentChange]);
  const toggle = (id: SectionId) => setOpen((cur) => (cur === id ? null : id));

  const removeBreak = useReplaceStaffBreaks({
    onSuccess: () => toast.success(t('team.breaks.removed')),
  });
  const removeTimeOff = useDeleteTimeOff({
    onSuccess: () => toast.success(t('team.timeOff.removed')),
  });

  const daysText = workingDaysSummary(week, to);
  const hoursSummary = !daysText
    ? t('team.workingDays.none')
    : inherited
      ? t('team.workingDays.inherited', { days: daysText })
      : daysText;
  const hoursLines: SectionLine[] = week.map((day) => ({
    key: String(day.weekday),
    left: weekdayName(day.weekday),
    right: dayHours(day, to) ?? t('team.off'),
  }));
  const breakLines: SectionLine[] = breaks.map((b) => ({
    key: b.id,
    left: b.label,
    right: breakTimes(b, to),
    caption: weekdaysLabel(b.weekdays, t('team.breaks.everyDay')),
    accessibilityLabel: t('team.breaks.editLine', {
      label: b.label,
      times: breakTimes(b, to),
    }),
    onPress: () => setSheet({ kind: 'break', item: b }),
    onDelete: () => setDeleting({ kind: 'break', item: b }),
  }));
  const offLines: SectionLine[] = timeOff.map((e) => ({
    key: e.id,
    left: t(`team.timeOff.reasons.${e.reason}`),
    right: timeOffRange(e, to),
    caption: e.note,
    accessibilityLabel: t('team.timeOff.editLine', {
      reason: t(`team.timeOff.reasons.${e.reason}`),
      range: timeOffRange(e, to),
    }),
    onPress: () => setSheet({ kind: 'off', item: e }),
    onDelete: () => setDeleting({ kind: 'off', item: e }),
  }));

  const businessWeek: DayHours[] = toWeekSchedule(businessHours);
  const initialWeek = inherited
    ? businessWeek
    : toStaffWeek(rules, businessHours);
  const first = breaks[0];
  const firstOff = timeOff[0];

  return (
    <>
      <ScheduleSection
        title={t('team.workingDays.title')}
        summary={hoursSummary}
        lines={hoursLines}
        actionLabel={t('team.hours.change')}
        onAction={() => setSheet({ kind: 'hours' })}
        open={open === 'hours'}
        onToggle={() => toggle('hours')}
      />
      <ScheduleSection
        showSeparator
        title={t('team.breaks.title')}
        summary={
          first
            ? withMore(
                `${first.label} ${breakTimes(first, to)}`,
                breaks.length,
                t('team.more_count', { count: breaks.length - 1 }),
              )
            : t('team.breaks.none')
        }
        lines={breakLines}
        actionLabel={t('team.breaks.addAction')}
        onAction={() => setSheet({ kind: 'break', item: null })}
        open={open === 'breaks'}
        onToggle={() => toggle('breaks')}
      />
      <ScheduleSection
        showSeparator
        title={t('team.timeOff.title')}
        summary={
          firstOff
            ? withMore(
                timeOffRange(firstOff, to),
                timeOff.length,
                t('team.more_count', { count: timeOff.length - 1 }),
              )
            : t('team.timeOff.none')
        }
        lines={offLines}
        actionLabel={t('team.timeOff.addAction')}
        onAction={() => setSheet({ kind: 'off', item: null })}
        open={open === 'off'}
        onToggle={() => toggle('off')}
      />

      {sheet?.kind === 'hours' ? (
        <WorkingHoursSheet
          staffId={staffId}
          initial={initialWeek}
          business={businessWeek}
          inherited={inherited}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet?.kind === 'break' ? (
        <BreakSheet
          staffId={staffId}
          existing={breaks}
          editing={sheet.item}
          onClose={() => setSheet(null)}
          onRequestDelete={(item) => {
            setSheet(null);
            setDeleting({ kind: 'break', item });
          }}
        />
      ) : null}
      {sheet?.kind === 'off' && window ? (
        <TimeOffSheet
          staffId={staffId}
          editing={sheet.item}
          today={window.today}
          timezone={window.timezone}
          onClose={() => setSheet(null)}
          onRequestDelete={(item) => {
            setSheet(null);
            setDeleting({ kind: 'off', item });
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(isOpen) => !isOpen && setDeleting(null)}
        title={t(
          deleting?.kind === 'break'
            ? 'team.breaks.deleteDialog.title'
            : 'team.timeOff.deleteDialog.title',
        )}
        description={t(
          deleting?.kind === 'break'
            ? 'team.breaks.deleteDialog.description'
            : 'team.timeOff.deleteDialog.description',
        )}
        confirmLabel={t('team.deleteConfirm')}
        cancelLabel={t('team.deleteKeep')}
        destructive
        onConfirm={() => {
          if (deleting?.kind === 'break') {
            removeBreak.mutate({
              staffId,
              breaks: breaksWithout(breaks, deleting.item.id),
            });
          } else if (deleting) {
            removeTimeOff.mutate(deleting.item.id);
          }
          setDeleting(null);
        }}
      />
    </>
  );
}
