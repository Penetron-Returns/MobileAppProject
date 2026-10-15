import { haptics, IconButton, Text } from '@booking/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { monthLabel } from '../logic';

/** Previous / next month around the month name. The next arrow stops at the current month. */
export function MonthSwitcher({
  month,
  canNext,
  onPrev,
  onNext,
}: {
  month: string;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
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
      <Text
        role="heading"
        aria-level="2"
        accessibilityLiveRegion="polite"
        className="text-title font-semibold"
      >
        {monthLabel(month)}
      </Text>
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
