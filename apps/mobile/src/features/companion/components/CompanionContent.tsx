import { Button, Skeleton, Text } from '@booking/ui';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useAppColorScheme } from '@booking/ui';
import { describeError } from '@/lib/toast';

import { useCompanionSession } from '../hooks';
import { notReadyKey, type WidgetEvent } from '../logic';
import { CompanionWebView } from './CompanionWebView';

/**
 * What fills the sheet: a shimmer while the session is minted, the chat once
 * it is, a friendly explanation when the companion isn't set up, and a retry
 * when Nerova or the connection fails.
 */
export function CompanionContent({
  onWidgetEvent,
  draftText,
}: {
  onWidgetEvent?: (event: WidgetEvent) => void;
  /** Text to drop, unsent, into the chat box once the chat is ready. */
  draftText?: string;
} = {}) {
  const { t } = useTranslation();
  const { isDark } = useAppColorScheme();
  const session = useCompanionSession(isDark ? 'dark' : 'light');
  const { state } = session;

  if (state.status === 'ready') {
    return (
      <CompanionWebView
        sessionUrl={state.url}
        draftText={draftText}
        onEvent={(event) => {
          onWidgetEvent?.(event);
          if (event.kind === 'session_expired') session.onSessionExpired();
        }}
      />
    );
  }

  if (state.status === 'loading') {
    return (
      <View
        accessibilityLabel={t('companion.loading')}
        accessibilityState={{ busy: true }}
        className="gap-3 px-5 pt-4"
      >
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="mt-4 h-[52px] w-full rounded-full" />
      </View>
    );
  }

  if (state.status === 'not_ready') {
    const key = notReadyKey(state.details);
    return (
      <View accessibilityRole="alert" className="gap-2 px-6 pt-6">
        <Text role="heading" aria-level="2" className="text-section font-bold">
          {t(`companion.notReady.${key}.title`)}
        </Text>
        <Text className="text-title text-muted-foreground">
          {t(`companion.notReady.${key}.description`)}
        </Text>
        <Button
          variant="secondary"
          size="lg"
          className="mt-3"
          onPress={session.retry}
        >
          <Text className="text-title">{t('companion.checkAgain')}</Text>
        </Button>
      </View>
    );
  }

  const { message, requestId } = describeError(state.error);
  return (
    <View accessibilityRole="alert" className="gap-2 px-6 pt-6">
      <Text role="heading" aria-level="2" className="text-section font-bold">
        {t('companion.error.title')}
      </Text>
      <Text className="text-title text-muted-foreground">{message}</Text>
      {requestId ? (
        <Text className="text-meta text-muted-foreground">
          {t('errors.requestId', { id: requestId })}
        </Text>
      ) : null}
      <Button size="lg" className="mt-3" onPress={session.retry}>
        <Text className="text-title">{t('common.retry')}</Text>
      </Button>
    </View>
  );
}
