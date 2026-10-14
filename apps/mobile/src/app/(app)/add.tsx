import { useLocalSearchParams } from 'expo-router';

import { NewBookingScreen } from '@/features/bookings/components/NewBookingScreen';

export default function AddBookingRoute() {
  const { clientId, mode } = useLocalSearchParams<{
    clientId?: string;
    mode?: string;
  }>();
  return (
    <NewBookingScreen
      key={`${clientId ?? ''}:${mode ?? ''}`}
      initialClientId={clientId}
      startWithNewClient={mode === 'new'}
    />
  );
}
