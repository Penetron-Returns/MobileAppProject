import { useLocalSearchParams } from 'expo-router';

import { BookingDetailScreen } from '@/features/bookings/components/BookingDetailScreen';

export default function BookingDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BookingDetailScreen appointmentId={String(id)} />;
}
