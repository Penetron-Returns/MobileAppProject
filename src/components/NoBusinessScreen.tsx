import { useClerk } from '@clerk/expo';
import { Building2 } from 'lucide-react-native';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/**
 * Shown instead of the tabs when a signed-in user has no active (or any)
 * Clerk organisation membership — there is no business for this account to
 * manage yet. Owners invite staff from an existing business; there is no
 * self-serve "create a business" flow here.
 */
export function NoBusinessScreen() {
  const { signOut } = useClerk();

  return (
    <View className="bg-background flex-1 items-center justify-center gap-3 px-8">
      <View className="bg-accent mb-1 h-16 w-16 items-center justify-center rounded-full">
        <Icon as={Building2} size={30} className="text-primary" />
      </View>
      <Text className="text-center text-lg font-bold">No business linked</Text>
      <Text className="text-muted-foreground text-center text-sm">
        Your account isn&apos;t linked to a business yet. Ask an owner to invite
        you, or contact support if this looks wrong.
      </Text>
      <Button variant="outline" className="mt-4" onPress={() => signOut()}>
        <Text>Sign out</Text>
      </Button>
    </View>
  );
}
