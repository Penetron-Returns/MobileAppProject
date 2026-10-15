import { useLocalSearchParams } from 'expo-router';

import { NewBookingScreen } from '@/features/bookings/components/NewBookingScreen';

export default function NewBookingRoute() {
  const { clientId, mode } = useLocalSearchParams<{
    clientId?: string;
    mode?: string;
  }>();
  return (
    <NewBookingScreen
      initialClientId={clientId}
      startWithNewClient={mode === 'new'}
    />
  );
}
