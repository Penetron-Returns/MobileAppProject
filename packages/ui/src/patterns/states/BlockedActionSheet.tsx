import { CloudOff } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '../../components/Sheet';
import { IconDome } from '../../components/IconDome';
import { Button } from '../../components/Button';
import { Text } from '../../primitives/Text';
import { useDepth } from '../../theme/useDepth';
import { useDsText } from '../../lib/strings';

interface BlockedActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Re-checks the connection. Resolving closes the sheet; rejecting says "Still offline". */
  onTryAgain?: () => Promise<unknown>;
}

/**
 * Shown when an action that must be checked live (a new booking, a reply)
 * is tapped offline, so nobody double-books on a stale copy of the schedule.
 */
export function BlockedActionSheet({
  open,
  onOpenChange,
  onTryAgain,
}: BlockedActionSheetProps) {
  const t = useDsText();
  const depth = useDepth();
  const [stillOffline, setStillOffline] = React.useState(false);
  const [checking, setChecking] = React.useState(false);

  React.useEffect(() => {
    if (!open) setStillOffline(false);
  }, [open]);

  const tryAgain = async () => {
    if (!onTryAgain) {
      setStillOffline(true);
      return;
    }
    setChecking(true);
    try {
      await onTryAgain();
      onOpenChange(false);
    } catch {
      setStillOffline(true);
    } finally {
      setChecking(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="items-center gap-0 px-5 pb-8">
        <IconDome icon={CloudOff} className="mt-2" />
        <SheetTitle className="mt-3.5 text-center text-section font-bold">
          {t('states.blocked.title')}
        </SheetTitle>
        <SheetDescription className="mt-1 text-center text-title">
          {t('states.blocked.body')}
        </SheetDescription>
        {stillOffline ? (
          <Text
            accessibilityRole="alert"
            className="mt-3 text-center text-subtitle text-muted-foreground"
          >
            {t('states.blocked.stillOffline')}
          </Text>
        ) : null}
        <View className="mt-5 w-full gap-1">
          <Button size="lg" onPress={() => onOpenChange(false)}>
            <Text className="text-title">{t('states.blocked.ok')}</Text>
          </Button>
          <Pressable
            onPress={() => void tryAgain()}
            disabled={checking}
            accessibilityRole="button"
            accessibilityLabel={t('states.blocked.tryAgain')}
            className="min-h-12 items-center justify-center active:opacity-50"
          >
            <Text style={{ color: depth.colors.tint }} className="text-title">
              {t('states.blocked.tryAgain')}
            </Text>
          </Pressable>
        </View>
      </SheetContent>
    </Sheet>
  );
}
