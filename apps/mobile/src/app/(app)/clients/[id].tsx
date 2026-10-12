import { useLocalSearchParams } from 'expo-router';

import { ClientProfileScreen } from '@/features/clients/components/ClientProfileScreen';

export default function ClientProfileRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ClientProfileScreen clientId={String(id)} />;
}
