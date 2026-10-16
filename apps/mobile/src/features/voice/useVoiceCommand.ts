import { router } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useCheckInAppointment } from '@/features/appointments/hooks';
import { useDaySchedule } from '@/features/dashboard/hooks';
import { useCompanionSheet } from '@/features/companion/sdk/companionSheetControl';
import { useEntitlements } from '@/features/plans/hooks';
import { api, newIdempotencyKey } from '@/lib/api';
import { todayISO } from '@/lib/time';
import { toast } from '@/lib/toast';

import { askCompanion, type AskDeps } from './ask';
import { noOneDueMessage, pickAppointmentToCheckIn } from './checkIn';

const goToday = () => router.replace('/');

/** The ask path's API calls, with the screen's translator. */
const askDeps = (t: AskDeps['t']): AskDeps => ({
  t,
  ask: (text) => api.voiceAsk({ text }, newIdempotencyKey()),
  decide: (id, decision) =>
    api.voiceDecideApproval(id, decision, newIdempotencyKey()),
});

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
          : noOneDueMessage(pick.next, { timezone, t }),
      );
    } else {
      const full = pick.appointment.client?.name ?? t('today.unknownClient');
      checkedInName.current = full.split(' ')[0];
      mutate(pick.appointment.id);
    }
    goToday();
  }, [fresh, day.isError, day.data, day.error, name, t, mutate, timezone]);
}

/** Anything else: open the companion sheet with the transcript (paid plans only). */
export function useRequestByVoice(text: string) {
  const { t } = useTranslation();
  const entitlements = useEntitlements();
  const sheet = useCompanionSheet();
  const handled = React.useRef(false);

  React.useEffect(() => {
    if (entitlements.isLoading || handled.current) return;
    handled.current = true;
    goToday();
    if (!entitlements.has('companion')) {
      toast.info(t('voice.noCompanion'));
      return;
    }
    // The persistent SDK sheet opens in place; otherwise the route does.
    const openCompanion = () => {
      if (sheet.isAvailable) {
        sheet.open(text ? { draft: text } : undefined);
        return;
      }
      router.push({
        pathname: '/companion',
        params: text ? { heard: text } : {},
      });
    };
    if (!text) {
      openCompanion();
      return;
    }
    // The same ask path as Hey Clovie with the app closed. A plain answer is shown here; an approval (or any
    // failure) opens the companion, which has the approval cards.
    void askCompanion(text, askDeps(t)).then((outcome) => {
      if (outcome.status === 'done' && !outcome.pendingApprovalId) {
        toast.info(outcome.message);
      } else {
        openCompanion();
      }
    });
  }, [entitlements, sheet, text, t]);
}
