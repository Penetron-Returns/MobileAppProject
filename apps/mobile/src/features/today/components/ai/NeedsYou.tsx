import { Button, Pressable, Surface, Text, useDepth } from '@booking/ui';
import type { Approval } from '@nerova/react-native';
import { Check, TriangleAlert } from 'lucide-react-native';

import { Tile } from './Tile';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

/** The all-clear: a green-tinted card with a check tile. */
function AllClear() {
  const { t } = useTranslation();
  const depth = useDepth();
  const isDark = depth.scheme === 'dark';
  return (
    <View className="px-5 pt-6">
      <Surface
        variant="raised"
        radius={22}
        className="flex-row items-center gap-3 px-4 py-3.5"
      >
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 22,
            backgroundColor: isDark
              ? 'rgba(48,219,91,0.07)'
              : 'rgba(52,199,89,0.07)',
            borderWidth: 1,
            borderColor: isDark
              ? 'rgba(48,219,91,0.25)'
              : 'rgba(36,138,61,0.22)',
          }}
        />
        <Tile
          tone="ok"
          icon={Check}
          size={40}
          iconSize={22}
          strokeWidth={2.6}
        />
        <View className="min-w-0 flex-1">
          <Text className="text-title font-semibold">
            {t('today.ai.needs.none')}
          </Text>
          <Text className="text-subtitle text-muted-foreground">
            {t('today.ai.needs.noneDetail')}
          </Text>
        </View>
      </Surface>
    </View>
  );
}

/** The companion's follow-up after an approval, in place of the card for a moment. */
function Confirmation({ text }: { text: string }) {
  const depth = useDepth();
  return (
    <View
      accessibilityLiveRegion="polite"
      className="flex-row items-center gap-2 px-5 pt-6"
    >
      <Check size={16} strokeWidth={2.4} color={depth.colors.tint} />
      <Text className="flex-1 text-subtitle">{text}</Text>
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
  confirmation = null,
  onApprove,
  onOpenClovie,
}: {
  pending: readonly Approval[];
  /** The companion's follow-up line to show instead of the card, if any. */
  confirmation?: string | null;
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

  if (confirmation) return <Confirmation text={confirmation} />;
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
    <View className="px-5 pt-6">
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
          <Tile
            tone="reminded"
            icon={TriangleAlert}
            size={40}
            iconSize={22}
            strokeWidth={2.2}
          />
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
