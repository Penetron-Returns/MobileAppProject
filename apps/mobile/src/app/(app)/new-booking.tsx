import { useLocalSearchParams } from 'expo-router';

import { NewBookingScreen } from '@/features/bookings/components/NewBookingScreen';

export default function NewBookingRoute() {
  const { clientId, mode, staffId, date, time } = useLocalSearchParams<{
    clientId?: string;
    mode?: string;
    staffId?: string;
    date?: string;
    time?: string;
  }>();
  return (
    <NewBookingScreen
      initialClientId={clientId}
      startWithNewClient={mode === 'new'}
      prefill={{ staffId, date, time }}
    />
  );
}
