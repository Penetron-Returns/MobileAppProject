import { Icon, Text } from '@booking/ui';
import { AlertTriangle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

/**
 * Rendered instead of the app when a required `EXPO_PUBLIC_*` variable is
 * missing, so a bad `.env` fails loudly instead of crashing deep inside
 * Clerk/Supabase. It needs no Clerk, Supabase or query client: only the
 * design system's tokens, so it always renders.
 */
export function ConfigErrorScreen({ missing }: { missing: string[] }) {
  const { t } = useTranslation();
  return (
    <View className="flex-1 bg-background pt-16">
      <ScrollView contentContainerClassName="gap-3 p-6">
        <Icon as={AlertTriangle} size={28} className="text-destructive" />
        <Text role="heading" aria-level="1" className="text-section font-bold">
          {t('config.title')}
        </Text>
        <Text className="text-subtitle text-muted-foreground">
          {t('config.body')}
        </Text>
        {missing.map((name) => (
          <Text key={name} className="font-mono text-subtitle text-destructive">
            {name}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}
