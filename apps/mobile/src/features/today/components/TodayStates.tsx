import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import {
  CalendarDays,
  CheckCircle2,
  CloudOff,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Surface } from '@/components/Surface';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { isApiError } from '@/lib/api';
import { useDepth } from '@/hooks/useDepth';
import { errorMessage } from '@/lib/toast';

import { useBookingLink } from '../hooks';

function Dome({ icon: IconGlyph }: { icon: LucideIcon }) {
  const depth = useDepth();
  return (
    <Surface
      variant="dome"
      radius={26}
      className="h-[52px] w-[52px] items-center justify-center"
    >
      <IconGlyph size={26} strokeWidth={1.8} color={depth.colors.secondary} />
    </Surface>
  );
}

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
  const requestId = isApiError(error) ? error.requestId : null;
  return (
    <Surface
      variant="raised"
      accessibilityRole="alert"
      className="mx-5 mt-5 items-center px-5 py-8"
    >
      <Dome icon={TriangleAlert} />
      <Text className="mt-3.5 text-center text-section font-bold">
        {t('today.error.title')}
      </Text>
      <Text className="mt-1 text-center text-title text-muted-foreground">
        {t('today.error.description')}
      </Text>
      <Text className="mt-1 text-center text-meta text-muted-foreground">
        {errorMessage(error)}
      </Text>
      {requestId ? (
        <Text
          selectable
          className="text-center text-meta text-muted-foreground"
        >
          {t('errors.requestId', { id: requestId })}
        </Text>
      ) : null}
      <Button size="lg" className="mt-5 self-stretch" onPress={onRetry}>
        <Text className="text-title">{t('common.retry')}</Text>
      </Button>
    </Surface>
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
      <Dome icon={CalendarDays} />
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
      <Dome icon={CheckCircle2} />
      <Text className="mt-3.5 text-section font-bold">
        {t('today.allDone.title')}
      </Text>
      <Text className="mt-1 text-title text-muted-foreground">
        {t('today.allDone.description')}
      </Text>
    </Surface>
  );
}

/** Quiet banner shown while the screen is on saved data. */
export function OfflineBanner({ lastUpdated }: { lastUpdated: string | null }) {
  const { t } = useTranslation();
  const depth = useDepth();
  return (
    <View
      accessibilityRole="alert"
      style={{ backgroundColor: depth.colors.amberFill }}
      className="mx-5 mt-4 flex-row items-center gap-2 rounded-2xl px-3.5 py-2.5"
    >
      <CloudOff size={18} strokeWidth={1.8} color={depth.colors.amber} />
      <Text
        style={{ color: depth.colors.amber }}
        className="flex-1 text-subtitle font-semibold"
      >
        {lastUpdated
          ? t('today.offline', { time: lastUpdated })
          : t('today.offlineNoTime')}
      </Text>
    </View>
  );
}
