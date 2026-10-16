import { Text, useDepth, withAlpha } from '@booking/ui';
import { Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

/**
 * "Confirmed by client": the client tapped Confirm on a reminder. Renders nothing until they have.
 * `pill` is the labelled capsule (booking detail, hero card); `glyph` is a lone check for dense rows
 * (calendar blocks, day list) and carries the label for screen readers.
 */
export function ClientConfirmedBadge({
  confirmedAt,
  variant = 'pill',
}: {
  confirmedAt: string | null | undefined;
  variant?: 'pill' | 'glyph';
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  if (!confirmedAt) return null;
  const label = t('clientConfirmed.label');
  const color = depth.colors.green;

  if (variant === 'glyph') {
    return (
      <View
        accessible
        accessibilityLabel={label}
        style={{ backgroundColor: withAlpha(color, 0.16) }}
        className="h-[18px] w-[18px] items-center justify-center rounded-full"
      >
        <Check size={11} strokeWidth={3} color={color} />
      </View>
    );
  }
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{ backgroundColor: withAlpha(color, 0.14) }}
      className="flex-row items-center gap-1 self-start rounded-xl px-2.5 py-[3px]"
    >
      <Check size={12} strokeWidth={3} color={color} />
      <Text style={{ color }} className="text-meta font-semibold">
        {label}
      </Text>
    </View>
  );
}
