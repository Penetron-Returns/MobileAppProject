import { useLocalSearchParams } from 'expo-router';

import { RescheduleScreen } from '@/features/bookings/components/RescheduleScreen';

export default function RescheduleRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RescheduleScreen appointmentId={String(id)} />;
}
