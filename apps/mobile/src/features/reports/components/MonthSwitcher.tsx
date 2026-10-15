import { haptics, IconButton, Menu, Text, useDepth } from '@booking/ui';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { monthLabel, recentMonths } from '../logic';

/**
 * Previous / next month around the month name. The next arrow stops at the
 * current month; tapping the name opens a pull-down of the last twelve months
 * to jump straight to one.
 */
export function MonthSwitcher({
  month,
  currentMonth,
  canNext,
  onPrev,
  onNext,
  onPick,
}: {
  month: string;
  currentMonth: string;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPick: (month: string) => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  return (
    <View className="mx-4 flex-row items-center justify-between">
      <IconButton
        icon={ChevronLeft}
        label={t('reports.prevMonth')}
        variant="plain"
        onPress={() => {
          haptics.selection();
          onPrev();
        }}
      />
      <Menu
        options={recentMonths(currentMonth).map((m) => ({
          value: m,
          label: monthLabel(m),
        }))}
        selected={month}
        onSelect={onPick}
        accessibilityLabel={t('reports.pickMonth', {
          month: monthLabel(month),
        })}
        className="min-h-11 flex-row items-center justify-center gap-1 px-2"
      >
        <Text
          role="heading"
          aria-level="2"
          accessibilityLiveRegion="polite"
          className="text-title font-semibold"
        >
          {monthLabel(month)}
        </Text>
        <ChevronDown
          size={14}
          strokeWidth={2.8}
          color={depth.colors.secondary}
        />
      </Menu>
      <IconButton
        icon={ChevronRight}
        label={t('reports.nextMonth')}
        variant="plain"
        disabled={!canNext}
        onPress={() => {
          haptics.selection();
          onNext();
        }}
      />
    </View>
  );
}
