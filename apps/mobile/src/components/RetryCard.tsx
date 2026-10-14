import { TriangleAlert } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Surface } from '@/components/Surface';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useDepth } from '@/hooks/useDepth';
import { isApiError } from '@/lib/api';
import { errorMessage } from '@/lib/toast';
import { cn } from '@/lib/utils';

/** A failed load: what happened, the request id when the API gave one, and one way forward. */
export function RetryCard({
  title,
  description,
  error,
  onRetry,
  className,
}: {
  title: string;
  description: string;
  error: unknown;
  onRetry: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const requestId = isApiError(error) ? error.requestId : null;
  return (
    <Surface
      variant="raised"
      accessibilityRole="alert"
      className={cn('mx-5 mt-5 items-center px-5 py-8', className)}
    >
      <Surface
        variant="dome"
        radius={26}
        className="h-[52px] w-[52px] items-center justify-center"
      >
        <TriangleAlert
          size={26}
          strokeWidth={1.8}
          color={depth.colors.secondary}
        />
      </Surface>
      <Text className="mt-3.5 text-center text-section font-bold">{title}</Text>
      <Text className="mt-1 text-center text-title text-muted-foreground">
        {description}
      </Text>
      <Text className="mt-1 text-center text-meta text-muted-foreground">
        {errorMessage(error)}
      </Text>
      {requestId ? (
        <View>
          <Text
            selectable
            className="text-center text-meta text-muted-foreground"
          >
            {t('errors.requestId', { id: requestId })}
          </Text>
        </View>
      ) : null}
      <Button size="lg" className="mt-5 self-stretch" onPress={onRetry}>
        <Text className="text-title">{t('common.retry')}</Text>
      </Button>
    </Surface>
  );
}
