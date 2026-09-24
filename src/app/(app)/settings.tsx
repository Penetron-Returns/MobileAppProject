import { useClerk, useOrganization } from '@clerk/expo';
import { LogOut, Settings as SettingsIcon } from 'lucide-react-native';

import { ClerkUserButton } from '@/components/ClerkUserButton';
import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { EmptyState } from '@/components/States';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export default function SettingsScreen() {
  const { signOut } = useClerk();
  const { organization } = useOrganization();

  return (
    <Screen
      header={<Header title="Settings" hideBack right={<ClerkUserButton />} />}
    >
      {organization ? (
        <Text className="text-muted-foreground text-center text-sm">
          {organization.name}
        </Text>
      ) : null}
      <EmptyState
        icon={SettingsIcon}
        title="Coming soon"
        description="Business details, operating hours, services, staff and WhatsApp integration will live here."
      />
      <Button variant="outline-destructive" onPress={() => signOut()}>
        <Icon as={LogOut} className="text-destructive" size={16} />
        <Text>Sign out</Text>
      </Button>
    </Screen>
  );
}
