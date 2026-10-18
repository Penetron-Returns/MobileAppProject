import { useUser } from '@clerk/expo';
import { Text } from '@booking/ui';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useBusiness } from '@/features/business/hooks';
import { formatDayCaption } from '@/features/today/logic';
import { useNow } from '@/hooks/useNow';
import { todayISO } from '@/lib/time';

import { greetingText } from '../greeting';

/** The greeting only changes on the hour, so a slow clock is plenty. */
const CLOCK_MS = 5 * 60_000;
const FALLBACK_TIMEZONE = 'UTC';

/**
 * The date line and the large greeting (the screen's heading). It owns the
 * clock, so its tick re-renders these two lines and not the whole tab. Static:
 * no entrance animation, so the first frame is the final frame.
 */
export function ClovieHeader() {
  const { t } = useTranslation();
  const { user } = useUser();
  const business = useBusiness();
  const now = useNow(CLOCK_MS);
  const timezone = business.data?.timezone ?? FALLBACK_TIMEZONE;
  const greeting = greetingText(now, timezone, user?.firstName);
  const caption = formatDayCaption(todayISO(timezone, now));
  return (
    <View className="px-5 pt-1">
      <Text className="text-title font-semibold text-muted-foreground">
        {caption}
      </Text>
      <Text
        role="heading"
        aria-level="1"
        style={{ letterSpacing: 0.4 }}
        className="text-large-title font-bold"
      >
        {t(greeting.key, greeting.values)}
      </Text>
    </View>
  );
}
