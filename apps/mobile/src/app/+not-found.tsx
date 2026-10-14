import { Button, EmptyState, Screen, Text } from '@booking/ui';
import { Link, Stack } from 'expo-router';
import { SearchX } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

export default function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t('notFound.headerTitle') }} />
      <Screen>
        <EmptyState
          icon={SearchX}
          title={t('notFound.title')}
          action={
            <Link href="/" asChild>
              <Button>
                <Text>{t('notFound.action')}</Text>
              </Button>
            </Link>
          }
        />
      </Screen>
    </>
  );
}
