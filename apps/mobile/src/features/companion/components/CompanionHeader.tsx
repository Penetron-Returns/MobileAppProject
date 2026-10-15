import { Text } from '@booking/ui';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

/** The sheet's header: the title. Clovie perches on the sheet's edge (`CompanionEdgeClovie`). */
export function CompanionHeader() {
  const { t } = useTranslation();
  return (
    <View className="px-5 pb-2">
      <Text role="heading" aria-level="1" className="text-section font-bold">
        {t('companion.title')}
      </Text>
    </View>
  );
}
