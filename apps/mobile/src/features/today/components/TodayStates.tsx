import {
  Button,
  ErrorState,
  IconDome,
  Skeleton,
  Surface,
  Text,
} from '@booking/ui';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { CalendarDays, CheckCircle2 } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { describeError } from '@/lib/toast';

import { useBookingLink } from '../hooks';

/** Placeholder shaped like the hero card and the list while the first load runs. */
export function TodaySkeleton() {
  const { t } = useTranslation();
  return (
    <View
      accessibilityLabel={t('today.loading')}
      accessibilityState={{ busy: true }}
    >
      <Surface variant="hero" className="mx-5 mt-5 gap-3 p-4">
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="mt-2 h-[52px] w-full rounded-full" />
      </Surface>
      <Surface variant="raised" className="mx-5 mt-7 gap-4 p-4">
        {[0, 1, 2].map((i) => (
          <View key={i} className="flex-row items-center gap-3.5">
            <Skeleton className="h-5 w-[50px]" />
            <View className="flex-1 gap-1.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3.5 w-1/3" />
            </View>
          </View>
        ))}
      </Surface>
    </View>
  );
}

/** A failed first load: what happened, and one way forward. Shows the request id when the API gave one. */
export function TodayError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ErrorState
      variant="banner"
      title={t('today.error.title')}
      description={t('today.error.description')}
      {...describeError(error)}
      onRetry={onRetry}
    />
  );
}

/** Nothing booked today: share the WhatsApp link or add a booking by hand. */
export function TodayEmpty() {
  const { t } = useTranslation();
  const link = useBookingLink();
  const [copied, setCopied] = React.useState(false);

  const copyLink = async () => {
    if (!link) return;
    await Clipboard.setStringAsync(`https://${link}`);
    setCopied(true);
  };

  return (
    <Surface variant="hero" className="mx-5 mt-5 px-5 pb-5 pt-6">
      <IconDome icon={CalendarDays} />
      <Text
        role="heading"
        aria-level="2"
        className="mt-3.5 text-section font-bold"
      >
        {t('today.empty.title')}
      </Text>
      <Text className="mt-1 text-title text-muted-foreground">
        {t('today.empty.description')}
      </Text>
      {link ? (
        <Surface
          variant="inset"
          className="mt-4 min-h-12 flex-row items-center gap-3 py-1 pl-4 pr-1"
        >
          <Text
            numberOfLines={1}
            accessibilityLabel={t('today.empty.linkLabel')}
            style={{ fontVariant: ['tabular-nums'] }}
            className="min-w-0 flex-1 text-title"
          >
            {link}
          </Text>
          <Button
            size="sm"
            className="h-10"
            onPress={() => void copyLink()}
            accessibilityLabel={t('today.empty.copyLink')}
          >
            <Text className="text-title">
              {copied ? t('today.empty.copied') : t('today.empty.copyLink')}
            </Text>
          </Button>
        </Surface>
      ) : null}
      <Button
        variant="secondary"
        size="lg"
        className="mt-3"
        onPress={() => router.navigate('/add' as never)}
      >
        <Text className="text-title">{t('today.empty.addBooking')}</Text>
      </Button>
    </Surface>
  );
}

/** Bookings exist today but every one is finished or cancelled. */
export function TodayAllDone() {
  const { t } = useTranslation();
  return (
    <Surface variant="hero" className="mx-5 mt-5 px-5 py-6">
      <IconDome icon={CheckCircle2} />
      <Text className="mt-3.5 text-section font-bold">
        {t('today.allDone.title')}
      </Text>
      <Text className="mt-1 text-title text-muted-foreground">
        {t('today.allDone.description')}
      </Text>
    </Surface>
  );
}
