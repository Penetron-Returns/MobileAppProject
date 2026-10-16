import { Button, Pressable, Surface, Text, useDepth } from '@booking/ui';
import type { Approval } from '@nerova/react-native';
import { Check, TriangleAlert } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

const AMBER_TILE = 'linear-gradient(180deg, #FFC15A, #E68A00)';
const TILE_SHADOW =
  '0 1px 2px rgba(16,24,40,0.25), 0 4px 10px -3px rgba(16,24,40,0.3), inset 0 1px 0 rgba(255,255,255,0.45)';

/** The quiet all-clear: a grey tick and one line, no card. */
function AllClear() {
  const { t } = useTranslation();
  const depth = useDepth();
  return (
    <View className="flex-row items-center gap-2 px-5 pt-4">
      <Check size={16} strokeWidth={2.4} color={depth.colors.secondary} />
      <Text className="text-subtitle text-muted-foreground">
        {t('today.ai.needs.none')}
      </Text>
    </View>
  );
}

/**
 * "Needs you": all clear is a quiet line; pending approvals are one raised
 * amber card showing the first, with Approve and Not now. Not now follows the
 * SDK sheet (it keeps the approval waiting, it does not decline it): it moves
 * to the next one, and what is left waiting stays a tap away.
 */
export function NeedsYou({
  pending,
  busyId,
  onApprove,
  onOpenClovie,
}: {
  pending: readonly Approval[];
  /** The approval being approved right now, if any. */
  busyId: string | null;
  onApprove: (id: string) => void;
  onOpenClovie: () => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const [deferred, setDeferred] = React.useState<readonly string[]>([]);
  const open = pending.filter((a) => !deferred.includes(a.id));
  const first = open[0];
  const waiting = pending.length - open.length;

  if (pending.length === 0) return <AllClear />;
  if (!first) {
    return (
      <Pressable
        onPress={onOpenClovie}
        accessibilityRole="button"
        accessibilityLabel={t('today.ai.needs.waitingLabel')}
        className="min-h-11 justify-center px-5 pt-3"
      >
        <Text className="text-subtitle text-muted-foreground">
          {t('today.ai.needs.waiting', { count: waiting })}
        </Text>
      </Pressable>
    );
  }
  const isBusy = busyId === first.id;
  return (
    <View className="px-5 pt-5">
      <Surface variant="raised" radius={22} className="px-4 pb-4 pt-3.5">
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 22,
            backgroundColor: 'rgba(255,149,0,0.09)',
            borderWidth: 1,
            borderColor:
              depth.scheme === 'dark'
                ? 'rgba(255,179,64,0.38)'
                : 'rgba(230,138,0,0.36)',
          }}
        />
        <View className="flex-row items-center gap-3">
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              experimental_backgroundImage: AMBER_TILE,
              boxShadow: TILE_SHADOW,
            }}
          >
            <TriangleAlert size={22} strokeWidth={2.2} color="#FFFFFF" />
          </View>
          <View className="min-w-0 flex-1">
            <Text
              role="heading"
              aria-level="2"
              className="text-title font-semibold"
            >
              {t('today.ai.needs.title', { count: pending.length })}
            </Text>
            <Text
              numberOfLines={2}
              className="text-subtitle text-muted-foreground"
            >
              {first.title}
            </Text>
          </View>
        </View>
        <View className="mt-3 flex-row gap-2.5">
          <Button
            className="flex-1"
            size="lg"
            disabled={isBusy}
            onPress={() => onApprove(first.id)}
            accessibilityLabel={t('today.ai.needs.approveLabel', {
              title: first.title,
            })}
            accessibilityState={{ busy: isBusy, disabled: isBusy }}
          >
            <Text className="text-title">{t('today.ai.needs.approve')}</Text>
          </Button>
          <Button
            className="flex-1"
            size="lg"
            variant="secondary"
            disabled={isBusy}
            onPress={() => setDeferred((ids) => [...ids, first.id])}
            accessibilityLabel={t('today.ai.needs.notNowLabel', {
              title: first.title,
            })}
          >
            <Text style={{ color: depth.colors.tint }} className="text-title">
              {t('today.ai.needs.notNow')}
            </Text>
          </Button>
        </View>
      </Surface>
    </View>
  );
}
