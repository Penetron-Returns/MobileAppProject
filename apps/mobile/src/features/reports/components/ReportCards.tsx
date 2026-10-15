import type {
  BookingsBySourceDTO,
  BusiestSlotDTO,
  CompanionOutcomesDTO,
} from '@booking/types';
import { Surface, Text, useDepth } from '@booking/ui';
import {
  CalendarCheck,
  CalendarClock,
  CalendarX,
  MessagesSquare,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { busiestParts, sourceRows } from '../logic';

const OUTCOMES: { key: keyof CompanionOutcomesDTO; icon: LucideIcon }[] = [
  { key: 'bookings_created', icon: CalendarCheck },
  { key: 'bookings_rescheduled', icon: CalendarClock },
  { key: 'bookings_cancelled', icon: CalendarX },
  { key: 'conversations_handled', icon: MessagesSquare },
];

function SectionHeading({ children }: { children: string }) {
  return (
    <Text
      role="heading"
      aria-level="2"
      className="mx-5 mb-2 mt-7 text-section font-bold"
    >
      {children}
    </Text>
  );
}

/** What the companion did: four counts, or a calm note while it is not connected yet. */
export function CompanionCard({
  outcomes,
}: {
  outcomes: CompanionOutcomesDTO | null;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  return (
    <>
      <SectionHeading>{t('reports.companion.title')}</SectionHeading>
      <Surface variant="raised" radius={22} className="mx-5 px-4 py-1.5">
        {outcomes ? (
          <View className="flex-row flex-wrap">
            {OUTCOMES.map(({ key, icon: Glyph }) => (
              <View
                key={key}
                accessible
                accessibilityLabel={`${t(`reports.companion.labels.${key}`)}: ${outcomes[key]}`}
                className="min-h-16 w-1/2 flex-row items-center gap-2.5 py-2"
              >
                <Glyph
                  size={20}
                  strokeWidth={1.8}
                  color={depth.colors.secondary}
                />
                <View className="min-w-0 flex-1">
                  <Text
                    style={{ fontVariant: ['tabular-nums'] }}
                    className="text-[22px] font-bold leading-[26px]"
                  >
                    {outcomes[key]}
                  </Text>
                  <Text
                    numberOfLines={2}
                    className="text-subtitle text-muted-foreground"
                  >
                    {t(`reports.companion.labels.${key}`)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View className="py-3.5">
            <Text className="text-title font-semibold">
              {t('reports.companion.offline.title')}
            </Text>
            <Text className="mt-0.5 text-subtitle text-muted-foreground">
              {t('reports.companion.offline.description')}
            </Text>
          </View>
        )}
      </Surface>
    </>
  );
}

const OPACITIES = [1, 0.65, 0.4, 0.22];

/** Where bookings come from: a proportional strip and a legend (WhatsApp, Companion, Manual, Web). */
export function SourcesCard({ by }: { by: BookingsBySourceDTO }) {
  const { t } = useTranslation();
  const depth = useDepth();
  const rows = sourceRows(by);
  const spoken = (r: (typeof rows)[number]) =>
    t('reports.sources.row', {
      source: t(`reports.sources.${r.key}`),
      percent: r.percent,
    });
  return (
    <>
      <SectionHeading>{t('reports.sources.title')}</SectionHeading>
      <Surface variant="raised" radius={22} className="mx-5 px-4 py-3.5">
        {rows.length === 0 ? (
          <Text className="text-subtitle text-muted-foreground">
            {t('reports.sources.empty')}
          </Text>
        ) : (
          <>
            <View
              accessibilityRole="image"
              accessibilityLabel={rows.map(spoken).join(', ')}
              className="h-4 flex-row gap-0.5"
            >
              {rows.map((r, i) => (
                <View
                  key={r.key}
                  style={{
                    flex: r.count,
                    backgroundColor: depth.colors.tint,
                    opacity: OPACITIES[i],
                  }}
                  className="h-4 rounded-[5px]"
                />
              ))}
            </View>
            <View className="mt-2">
              {rows.map((r, i) => (
                <View
                  key={r.key}
                  accessible
                  accessibilityLabel={spoken(r)}
                  className="min-h-9 flex-row items-center gap-2.5"
                >
                  <View
                    style={{
                      backgroundColor: depth.colors.tint,
                      opacity: OPACITIES[i],
                    }}
                    className="h-2.5 w-2.5 rounded-full"
                  />
                  <Text className="flex-1 text-title">
                    {t(`reports.sources.${r.key}`)}
                  </Text>
                  <Text
                    style={{ fontVariant: ['tabular-nums'] }}
                    className="text-title text-muted-foreground"
                  >
                    {`${r.percent}%`}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </Surface>
    </>
  );
}

/** No-shows, cancellations and the busiest time, in one quiet card. */
export function StatsCard({
  noShows,
  cancellations,
  busiest,
}: {
  noShows: number;
  cancellations: number;
  busiest: BusiestSlotDTO | null;
}) {
  const { t } = useTranslation();
  const parts = busiest ? busiestParts(busiest) : null;
  const stats = [
    { key: 'noShows', value: noShows },
    { key: 'cancellations', value: cancellations },
  ];
  return (
    <Surface variant="raised" radius={22} className="mx-5 mt-5 p-4">
      <View className="flex-row">
        {stats.map(({ key, value }) => (
          <View
            key={key}
            accessible
            accessibilityLabel={`${t(`reports.stats.${key}`)}: ${value}`}
            className="min-w-0 flex-1"
          >
            <Text className="text-subtitle text-muted-foreground">
              {t(`reports.stats.${key}`)}
            </Text>
            <Text
              style={{ fontVariant: ['tabular-nums'] }}
              className="text-[28px] font-bold leading-[34px]"
            >
              {value}
            </Text>
          </View>
        ))}
      </View>
      <Text className="mt-3 text-subtitle text-muted-foreground">
        {parts
          ? t('reports.stats.busiest', parts)
          : t('reports.stats.busiestNone')}
      </Text>
    </Surface>
  );
}
