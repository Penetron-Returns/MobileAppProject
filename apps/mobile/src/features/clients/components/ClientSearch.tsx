import { Search } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, TextInput, View } from 'react-native';

import { Surface } from '@/components/Surface';
import { Text } from '@/components/ui/text';
import { useDepth } from '@/hooks/useDepth';

/** The pressed-in search field with a "Cancel" link once there is text. */
export function ClientSearch({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (text: string) => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  return (
    <View className="mx-5 mt-3 flex-row items-center gap-3">
      <Surface
        variant="inset"
        radius={12}
        className="h-11 flex-1 flex-row items-center gap-2 px-3"
      >
        <Search size={20} strokeWidth={1.8} color={depth.colors.secondary} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={t('clients.searchPlaceholder')}
          placeholderTextColor={depth.colors.secondary}
          accessibilityLabel={t('clients.searchLabel')}
          returnKeyType="search"
          autoCorrect={false}
          style={{ color: depth.colors.label }}
          className="h-11 min-w-0 flex-1 text-title"
        />
      </Surface>
      {value ? (
        <Pressable
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
          className="min-h-11 justify-center active:opacity-50"
        >
          <Text style={{ color: depth.colors.tint }} className="text-title">
            {t('common.cancel')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
