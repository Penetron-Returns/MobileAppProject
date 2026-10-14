import { TriangleAlert } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { Surface } from '@/components/Surface';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useDepth } from '@/hooks/useDepth';
import { isApiError } from '@/lib/api';
import { errorMessage } from '@/lib/toast';

interface ErrorScreenProps {
  error: unknown;
  onRetry: () => void;
  /** True while the retry is in flight (button shows a spinner). */
  isRetrying?: boolean;
  /** Overrides "Couldn't load this" with the thing that failed. */
  title?: string;
}

/**
 * A pushed screen's content failed to load: what happened, what still works
 * (nothing was lost), and one way forward. Shows the API reference id so a
 * report can be traced. Plain words, no codes (STATES.md).
 */
export function ErrorScreen({
  error,
  onRetry,
  isRetrying,
  title,
}: ErrorScreenProps) {
  const { t } = useTranslation();
  const depth = useDepth();
  const requestId = isApiError(error) ? error.requestId : null;
  return (
    <View accessibilityRole="alert" className="items-center px-10 pt-20">
      <Surface
        variant="dome"
        radius={32}
        className="h-16 w-16 items-center justify-center"
      >
        <TriangleAlert
          size={30}
          strokeWidth={1.8}
          color={depth.colors.secondary}
        />
      </Surface>
      <Text
        role="heading"
        aria-level="2"
        className="mt-4 text-center text-section font-bold"
      >
        {title ?? t('states.error.title')}
      </Text>
      <Text className="mt-1.5 text-center text-title text-muted-foreground">
        {t('states.error.description')}
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
      <Button
        size="lg"
        className="mt-6 self-stretch"
        onPress={onRetry}
        disabled={isRetrying}
        accessibilityLabel={t('common.retry')}
      >
        {isRetrying ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-title">{t('common.retry')}</Text>
        )}
      </Button>
    </View>
  );
}
