import {
  Avatar,
  Group,
  GroupBlock,
  Pressable,
  Text,
  Turn,
  useDepth,
  withAlpha,
  resolveSystemColor,
} from '@booking/ui';
import { ChevronDown } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { formatMoney } from '@/lib/format';
import { WEEKDAYS, WEEKDAYS_SHORT } from '@/lib/time';

import type { HeatMap, StaffRow } from '../aggregate';
import type { SourceRow } from '../sources';

const SOURCE_OPACITY = [1, 0.4];
const CELL_HEIGHT = 26;
const DAY_COLUMN = 32;

type SectionId = 'staff' | 'sources' | 'times';

function SectionHeader({
  label,
  expanded,
  onPress,
}: {
  label: string;
  expanded: boolean;
  onPress: () => void;
}) {
  const depth = useDepth();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded }}
      className="min-h-14 flex-row items-center justify-between px-4"
    >
      <Text className="text-title">{label}</Text>
      <Turn open={expanded} degrees={180}>
        <ChevronDown size={14} strokeWidth={3} color={depth.colors.secondary} />
      </Turn>
    </Pressable>
  );
}

function Empty({ children }: { children: string }) {
  return (
    <Text className="pb-4 text-subtitle text-muted-foreground">{children}</Text>
  );
}

function StaffSection({
  staff,
  currency,
}: {
  staff: readonly StaffRow[];
  currency: string;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  if (staff.length === 0) return <Empty>{t('reports.staff.empty')}</Empty>;
  return (
    <View className="pb-2">
      {staff.map((m) => (
        <View key={m.staffId} className="flex-row items-center gap-3 py-2">
          <Avatar
            name={m.name}
            size="md"
            ring={resolveSystemColor(m.color, depth.scheme)}
          />
          <View className="min-w-0 flex-1">
            <View className="flex-row items-baseline justify-between gap-2">
              <Text numberOfLines={1} className="min-w-0 flex-1 text-title">
                {m.name}
              </Text>
              <Text
                style={{ fontVariant: ['tabular-nums'] }}
                className="text-title font-semibold"
              >
                {formatMoney(m.revenueCents, currency, { decimals: false })}
              </Text>
            </View>
            <Text className="text-subtitle text-muted-foreground">
              {t('reports.staff.bookings', { count: m.bookings })}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function SourcesSection({ rows }: { rows: readonly SourceRow[] }) {
  const { t } = useTranslation();
  const depth = useDepth();
  if (rows.length === 0) return <Empty>{t('reports.sources.empty')}</Empty>;
  const spoken = (r: SourceRow) =>
    t('reports.sources.row', {
      source: t(`reports.sources.${r.key}`),
      percent: r.percent,
    });
  return (
    <View className="pb-3">
      <View
        accessibilityRole="image"
        accessibilityLabel={rows.map(spoken).join(', ')}
        className="h-4 flex-row gap-0.5"
      >
        {rows
          .filter((r) => r.count > 0)
          .map((r, i) => (
            <View
              key={r.key}
              style={{
                flex: r.count,
                backgroundColor: depth.colors.tint,
                opacity: SOURCE_OPACITY[i],
              }}
              className="h-4 min-w-0 rounded-[5px]"
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
                opacity: SOURCE_OPACITY[i],
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
    </View>
  );
}

function TimesSection({ heat }: { heat: HeatMap | null }) {
  const { t } = useTranslation();
  const depth = useDepth();
  if (!heat) return <Empty>{t('reports.times.empty')}</Empty>;
  const fill = (level: number) =>
    level === 0
      ? withAlpha(depth.colors.label, 0.05)
      : withAlpha(depth.colors.tint, 0.1 + (level - 1) * 0.2);
  const { peak } = heat;
  const hour = `${String(peak.hour).padStart(2, '0')}:00`;
  return (
    <View className="pb-3">
      <View
        accessibilityRole="image"
        accessibilityLabel={t('reports.times.chart')}
      >
        <View style={{ paddingLeft: DAY_COLUMN }} className="h-5 flex-row">
          {heat.hours.map((h) => (
            <Text
              key={h}
              numberOfLines={1}
              style={{ fontVariant: ['tabular-nums'] }}
              className="min-w-0 flex-1 text-center text-meta text-muted-foreground"
            >
              {String(h).padStart(2, '0')}
            </Text>
          ))}
        </View>
        {heat.weekdays.map((day, row) => (
          <View key={day} className="mt-[3px] flex-row items-center">
            <Text
              style={{ width: DAY_COLUMN }}
              className="text-meta text-muted-foreground"
            >
              {WEEKDAYS_SHORT[day]}
            </Text>
            {heat.levels[row].map((level, col) => (
              <View key={heat.hours[col]} className="min-w-0 flex-1 px-[1.5px]">
                <View
                  style={{ height: CELL_HEIGHT, backgroundColor: fill(level) }}
                  className="rounded-[5px]"
                />
              </View>
            ))}
          </View>
        ))}
      </View>
      <Text className="mt-3 text-subtitle text-muted-foreground">
        {t('reports.times.busiest', {
          day: WEEKDAYS[peak.weekday],
          time: hour,
        })}
      </Text>
    </View>
  );
}

/**
 * The board's one raised card of disclosure rows: By staff, Where bookings
 * come from, Busiest times. One row open at a time.
 */
export function ReportSections({
  staff,
  sources,
  heat,
  currency,
  footer,
}: {
  staff: readonly StaffRow[];
  sources: readonly SourceRow[];
  heat: HeatMap | null;
  currency: string;
  footer?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState<SectionId | null>(null);
  const toggle = (id: SectionId) => setOpen((cur) => (cur === id ? null : id));
  const sections: { id: SectionId; label: string; body: React.ReactNode }[] = [
    {
      id: 'staff',
      label: t('reports.staff.title'),
      body: <StaffSection staff={staff} currency={currency} />,
    },
    {
      id: 'sources',
      label: t('reports.sources.title'),
      body: <SourcesSection rows={sources} />,
    },
    {
      id: 'times',
      label: t('reports.times.title'),
      body: <TimesSection heat={heat} />,
    },
  ];
  return (
    <Group radius={22} className="mt-5">
      {sections.map(({ id, label, body }, i) => (
        <GroupBlock key={id} showSeparator={i > 0}>
          <SectionHeader
            label={label}
            expanded={open === id}
            onPress={() => toggle(id)}
          />
          {open === id ? <View className="px-4">{body}</View> : null}
        </GroupBlock>
      ))}
      {footer ? <GroupBlock showSeparator>{footer}</GroupBlock> : null}
    </Group>
  );
}
