import { AlertTriangle, TriangleAlert } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { Button } from '../../components/Button';
import { IconDome } from '../../components/IconDome';
import { cn } from '../../lib/cn';
import { Icon } from '../../primitives/Icon';
import { Surface } from '../../primitives/Surface';
import { Text } from '../../primitives/Text';
import { useDsText } from '../../lib/strings';

export interface ErrorStateProps {
  /**
   * `banner` is an inline strip above content, `card` replaces a list or
   * section, `screen` fills a pushed screen whose content failed to load.
   */
  variant?: 'banner' | 'card' | 'screen';
  /** What failed. Defaults to a generic "Couldn't load this". */
  title?: string;
  /** What still works and what to do. Defaults to a generic line (card and screen). */
  description?: string;
  /** The plain-language reason from the error (already translated). */
  message?: string;
  /** Support reference from the API, shown so a report can be traced. */
  requestId?: string | null;
  onRetry?: () => void;
  /** True while the retry is in flight (the button shows a spinner). */
  isRetrying?: boolean;
  className?: string;
}

/**
 * A failed load: what happened, why in plain words, the request id when the
 * API gave one, and one way forward. The design system knows nothing about
 * the API: callers pass the already-translated `message` and `requestId`.
 */
export function ErrorState({
  variant = 'card',
  title,
  description,
  message,
  requestId,
  onRetry,
  isRetrying,
  className,
}: ErrorStateProps) {
  const t = useDsText();
  const retryLabel = t('common.retry');
  const reference = requestId
    ? t('errors.requestId', {
        id: requestId,
      })
    : null;

  if (variant === 'banner') {
    return (
      <View
        accessibilityRole="alert"
        className={cn(
          'border-destructive/30 bg-destructive/5 flex-row items-start gap-3 rounded-xl border p-4',
          className,
        )}
      >
        <Icon
          as={AlertTriangle}
          size={20}
          className="text-destructive mt-0.5"
        />
        <View className="flex-1 gap-1">
          <Text className="font-semibold">
            {title ?? t('errors.loadFailed')}
          </Text>
          {message ? (
            <Text className="text-muted-foreground text-sm">{message}</Text>
          ) : null}
          {reference ? (
            <Text selectable className="text-muted-foreground text-xs">
              {reference}
            </Text>
          ) : null}
          {onRetry ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-2 self-start"
              onPress={onRetry}
            >
              <Text>{retryLabel}</Text>
            </Button>
          ) : null}
        </View>
      </View>
    );
  }

  const isScreen = variant === 'screen';
  const body = (
    <>
      <IconDome icon={TriangleAlert} size={isScreen ? 'lg' : 'md'} />
      <Text
        role="heading"
        aria-level="2"
        className={cn(
          'text-center text-section font-bold',
          isScreen ? 'mt-4' : 'mt-3.5',
        )}
      >
        {title ?? t('states.error.title')}
      </Text>
      <Text
        className={cn(
          'text-center text-title text-muted-foreground',
          isScreen ? 'mt-1.5' : 'mt-1',
        )}
      >
        {description ?? t('states.error.description')}
      </Text>
      {message ? (
        <Text className="mt-1 text-center text-meta text-muted-foreground">
          {message}
        </Text>
      ) : null}
      {reference ? (
        <Text
          selectable
          className="text-center text-meta text-muted-foreground"
        >
          {reference}
        </Text>
      ) : null}
      {onRetry ? (
        <Button
          size="lg"
          className={cn('self-stretch', isScreen ? 'mt-6' : 'mt-5')}
          onPress={onRetry}
          loading={isRetrying}
          accessibilityLabel={retryLabel}
        >
          {isRetrying ? null : <Text className="text-title">{retryLabel}</Text>}
        </Button>
      ) : null}
    </>
  );

  if (isScreen) {
    return (
      <View
        accessibilityRole="alert"
        className={cn('items-center px-10 pt-20', className)}
      >
        {body}
      </View>
    );
  }
  return (
    <Surface
      variant="raised"
      accessibilityRole="alert"
      className={cn('mx-5 mt-5 items-center px-5 py-8', className)}
    >
      {body}
    </Surface>
  );
}
