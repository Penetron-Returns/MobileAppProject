import type { SpecialDaySuggestionDTO } from '@booking/types';
import { Group, GroupRow, SectionTitle, Skeleton, TintLink } from '@booking/ui';
import { Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { formatWeekdayDayMonth } from '@/lib/time';

/** Upcoming South African public holidays not yet added: tap one to close that day. */
export function HolidaySuggestions({
  suggestions,
  loading,
  busy,
  onAdd,
  onAddAll,
}: {
  suggestions: SpecialDaySuggestionDTO[];
  loading: boolean;
  busy: boolean;
  onAdd: (suggestion: SpecialDaySuggestionDTO) => void;
  onAddAll: () => void;
}) {
  const { t } = useTranslation();
  if (!loading && suggestions.length === 0) return null;
  return (
    <>
      <SectionTitle className="mx-1 mb-2 mt-0">
        {t('hours.special.suggestions')}
      </SectionTitle>
      {loading ? (
        <View accessibilityLabel={t('hours.special.loading')}>
          <Skeleton className="h-14 w-full rounded-[22px]" />
        </View>
      ) : (
        <>
          <Group radius={22} className="mx-0">
            {suggestions.map((s, i) => {
              const date = formatWeekdayDayMonth(s.date);
              return (
                <GroupRow
                  key={s.date}
                  showSeparator={i > 0}
                  title={s.name}
                  subtitle={
                    s.observed_for
                      ? t('hours.special.observed', {
                          date,
                          sunday: formatWeekdayDayMonth(s.observed_for),
                        })
                      : date
                  }
                  detail={t('hours.closed')}
                  accessibilityLabel={t('hours.special.addHoliday', {
                    name: s.name,
                    date,
                  })}
                  onPress={busy ? undefined : () => onAdd(s)}
                />
              );
            })}
          </Group>
          <TintLink
            icon={Plus}
            label={t('hours.special.addAll')}
            onPress={onAddAll}
            className="ml-1 mt-1"
          />
        </>
      )}
    </>
  );
}
