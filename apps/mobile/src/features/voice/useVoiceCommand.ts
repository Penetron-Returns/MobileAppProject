import { router } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useCheckInAppointment } from '@/features/appointments/hooks';
import { useDaySchedule } from '@/features/dashboard/hooks';
import { useEntitlements } from '@/features/plans/hooks';
import { todayISO } from '@/lib/time';
import { toast } from '@/lib/toast';

import { pickAppointmentToCheckIn } from './checkIn';

const goToday = () => router.replace('/');

/**
 * "Client has arrived": refetches today's bookings (a stale cache must not
 * pick the wrong client), picks who is due, checks them in through the same
 * mutation as the Today card and goes back to Today.
 */
export function useCheckInByVoice(timezone: string, name: string | undefined) {
  const { t } = useTranslation();
  const day = useDaySchedule(todayISO(timezone), timezone);
  const checkedInName = React.useRef('');
  const { mutate } = useCheckInAppointment({
    onSuccess: () =>
      toast.success(t('voice.checkedIn', { name: checkedInName.current })),
  });
  const { refetch } = day;
  const [fresh, setFresh] = React.useState(false);
  const handled = React.useRef(false);

  React.useEffect(() => {
    void refetch().finally(() => setFresh(true));
  }, [refetch]);

  React.useEffect(() => {
    if (!fresh || handled.current) return;
    if (day.isError || !day.data) {
      handled.current = true;
      toast.failed(t('voice.failed'), day.error);
      goToday();
      return;
    }
    handled.current = true;
    const pick = pickAppointmentToCheckIn(day.data, { now: new Date(), name });
    if (pick.kind === 'none') {
      toast.info(
        pick.reason === 'no_name_match' && name
          ? t('voice.noNameMatch', { name })
          : t('voice.noAppointment'),
      );
    } else {
      const full = pick.appointment.client?.name ?? t('today.unknownClient');
      checkedInName.current = full.split(' ')[0];
      mutate(pick.appointment.id);
    }
    goToday();
  }, [fresh, day.isError, day.data, day.error, name, t, mutate]);
}

/** Anything else: open the companion sheet with the transcript (paid plans only). */
export function useRequestByVoice(text: string) {
  const { t } = useTranslation();
  const entitlements = useEntitlements();
  const handled = React.useRef(false);

  React.useEffect(() => {
    if (entitlements.isLoading || handled.current) return;
    handled.current = true;
    goToday();
    if (!entitlements.has('companion')) {
      toast.info(t('voice.noCompanion'));
      return;
    }
    router.push({
      pathname: '/companion',
      params: text ? { heard: text } : {},
    });
  }, [entitlements, text, t]);
}
