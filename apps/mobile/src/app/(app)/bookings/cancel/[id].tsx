import { useLocalSearchParams } from 'expo-router';

import { CancelScreen } from '@/features/bookings/components/CancelScreen';

export default function CancelRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CancelScreen appointmentId={String(id)} />;
}
