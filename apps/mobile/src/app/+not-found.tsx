import { Button, EmptyState, Screen, Text } from '@booking/ui';
import { Link, Stack } from 'expo-router';
import { SearchX } from 'lucide-react-native';

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
