import { Pressable, Surface, Text, Turn, useDepth } from '@booking/ui';
import {
  CalendarCheck,
  ChevronRight,
  Sunset,
  type LucideIcon,
} from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { digestCounts, type DigestEntry, type DigestPart } from '../../aiLogic';

type PartKey = 'morning' | 'afternoon';

const ICONS: Record<PartKey, LucideIcon> = {
  morning: CalendarCheck,
  afternoon: Sunset,
};

/** The plain-language line for a booking event: "Booked Megan for 15:00 (Clovie)". */
function useEntryText() {
  const { t } = useTranslation();
  return (entry: DigestEntry): string => {
    const text = t(`today.ai.soFar.entry.${entry.kind}`, {
      name: entry.name ?? t('today.unknownClient'),
      when: entry.when,
    });
    return entry.byClovie ? t('today.ai.soFar.entry.byClovie', { text }) : text;
  };
}

function PartRow({
  partKey,
  part,
  hasStarted,
  isFirst,
}: {
  partKey: PartKey;
  part: DigestPart;
  hasStarted: boolean;
  isFirst: boolean;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const entryText = useEntryText();
  const [open, setOpen] = React.useState(false);
  const Icon = ICONS[partKey];
  const counts = digestCounts(part);
  const canOpen = part.entries.length > 0;
  const title = t(`today.ai.soFar.${partKey}`);
  const digest = counts.length
    ? counts
        .map((c) => t(`today.ai.soFar.${c.kind}`, { count: c.count }))
        .join(', ')
        .replace(/^./, (c) => c.toUpperCase())
    : t(
        hasStarted
          ? 'today.ai.soFar.nothingChanged'
          : 'today.ai.soFar.nothingYet',
      );

  return (
    <View>
      {isFirst ? null : (
        <Surface
          variant="engrave"
          className="absolute left-[52px] right-0 top-0 h-0.5"
        />
      )}
      <Pressable
        onPress={() => setOpen((v) => !v)}
        disabled={!canOpen}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${digest}`}
        accessibilityState={{
          expanded: canOpen ? open : undefined,
          disabled: !canOpen,
        }}
        className="min-h-[60px] flex-row items-center gap-3 py-2.5"
      >
        <Surface
          variant="dome"
          radius={20}
          className="h-10 w-10 items-center justify-center"
        >
          <Icon size={21} strokeWidth={1.9} color={depth.colors.tint} />
        </Surface>
        <View className="min-w-0 flex-1">
          <Text className="text-title font-semibold">{title}</Text>
          <Text className="text-subtitle text-muted-foreground">{digest}</Text>
        </View>
        {canOpen ? (
          <Turn open={open} degrees={90}>
            <ChevronRight
              size={16}
              strokeWidth={2.6}
              color={depth.colors.secondary}
            />
          </Turn>
        ) : null}
      </Pressable>
      {open ? (
        <View className="pb-2.5 pl-[52px]">
          {part.entries.map((entry) => (
            <View key={entry.id} className="flex-row gap-2.5 py-1">
              <Text
                style={{ fontVariant: ['tabular-nums'] }}
                className="w-[42px] text-meta leading-[22px] text-muted-foreground"
              >
                {entry.time}
              </Text>
              <Text className="min-w-0 flex-1 text-subtitle leading-[22px]">
                {entryText(entry)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * "Today so far": a cardless digest of what changed, split into this morning
 * and this afternoon. A row with changes opens inline into a short timeline.
 */
export function TodaySoFar({
  morning,
  afternoon,
  hasAfternoonStarted,
}: {
  morning: DigestPart;
  afternoon: DigestPart;
  hasAfternoonStarted: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View>
      <Text
        role="heading"
        aria-level="2"
        className="mx-5 mb-1 mt-6 text-section font-bold"
      >
        {t('today.ai.soFar.title')}
      </Text>
      <View className="px-5">
        <PartRow partKey="morning" part={morning} hasStarted isFirst />
        <PartRow
          partKey="afternoon"
          part={afternoon}
          hasStarted={hasAfternoonStarted}
          isFirst={false}
        />
      </View>
    </View>
  );
}
