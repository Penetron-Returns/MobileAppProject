import { Pressable, Surface, Text, useDepth } from '@booking/ui';
import {
  Brush,
  LayoutGrid,
  Scissors,
  Sparkles,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { BUSINESS_TYPE_IDS, type BusinessTypeId } from '../logic';

const TYPE_ICONS: Record<BusinessTypeId, LucideIcon> = {
  barber: Scissors,
  salon: Brush,
  beauty: Sparkles,
  mix: LayoutGrid,
};

/** Four big cards; one tap picks the type and moves on. */
export function TypeStep({
  selected,
  onSelect,
}: {
  selected: BusinessTypeId | null;
  onSelect: (id: BusinessTypeId) => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('onboarding.typeLabel')}
      className="gap-3 px-5"
    >
      {BUSINESS_TYPE_IDS.map((id) => {
        const Glyph = TYPE_ICONS[id];
        const isSelected = selected === id;
        const label = t(`onboarding.types.${id}`);
        return (
          <Pressable
            key={id}
            feedback="dim"
            onPress={() => onSelect(id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={label}
          >
            <Surface
              variant="raised"
              radius={26}
              className="min-h-[88px] flex-row items-center gap-4 px-5"
              style={{
                borderWidth: 2,
                borderColor: isSelected ? depth.colors.tint : 'transparent',
              }}
            >
              <Glyph size={32} strokeWidth={1.8} color={depth.colors.tint} />
              <Text className="flex-1 text-section font-semibold">{label}</Text>
            </Surface>
          </Pressable>
        );
      })}
    </View>
  );
}
