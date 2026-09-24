import { Link, Stack } from 'expo-router';
import { SearchX } from 'lucide-react-native';

import { Screen } from '@/components/Screen';
import { EmptyState } from '@/components/States';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <Screen>
        <EmptyState
          icon={SearchX}
          title="This screen doesn't exist."
          action={
            <Link href="/" asChild>
              <Button>
                <Text>Go to Dashboard</Text>
              </Button>
            </Link>
          }
        />
      </Screen>
    </>
  );
}
