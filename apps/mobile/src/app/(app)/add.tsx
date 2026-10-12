import { useLocalSearchParams } from 'expo-router';

import { AddBookingScreen } from '@/features/bookings/components/AddBookingScreen';

export default function AddBookingRoute() {
  const { clientId, mode } = useLocalSearchParams<{
    clientId?: string;
    mode?: string;
  }>();
  return (
    <AddBookingScreen
      key={`${clientId ?? ''}:${mode ?? ''}`}
      initialClientId={clientId}
      startWithNewClient={mode === 'new'}
    />
  );
}
