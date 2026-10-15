import * as React from 'react';

import {
  useAvailabilityConfig,
  useUpcomingWindow,
} from '@/features/availability/hooks';
import { addDays } from '@/lib/time';

import { configureHandsFree, getHandsFree, isSupported } from './clovieVoice';
import { dutyWindows, flattenWindows, WINDOW_DAYS } from './duty';

/**
 * Hands the native side the next two weeks of opening windows (weekly hours plus special days, in
 * the business timezone), so hands-free can follow opening hours with the app closed. Runs each time
 * the app opens and when the hours change. Does nothing off Android or while hands-free is off.
 */
export function useVoiceScheduleSync(isReady: boolean) {
  const upcoming = useUpcomingWindow();
  const isActive = isReady && isSupported() && getHandsFree().enabled;
  const from = upcoming?.today ?? '';
  const to = upcoming ? addDays(upcoming.today, WINDOW_DAYS - 1) : '';
  const config = useAvailabilityConfig(from, to, isActive && Boolean(upcoming));
  const { data } = config;

  React.useEffect(() => {
    if (!data) return;
    configureHandsFree({
      timezone: data.timezone,
      windows: flattenWindows(
        dutyWindows({
          hours: data.business_hours,
          specialDays: data.special_days,
          timezone: data.timezone,
          from: data.from,
          days: WINDOW_DAYS,
        }),
      ),
    });
  }, [data]);
}
