import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Calendar,
  CalendarDays,
  Clock,
  MessageCircle,
  Phone,
  Scissors,
  User,
  XCircle,
} from 'lucide-react-native';
import * as React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Header } from '@/components/Header';
import { PersonAvatar } from '@/components/PersonAvatar';
import { Screen } from '@/components/Screen';
import { Icon } from '@/components/ui/icon';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

type BookingStatus = 'confirmed' | 'pending' | 'completed' | 'cancelled';

interface BookingDetail {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientImageUrl?: string;
  clientHistoryText: string;
  status: BookingStatus;
  bookedAt: string;
  dateText: string;
  timeText: string;
  serviceName: string;
  servicePrice: string;
  durationText: string;
  categoryText: string;
  staffName: string;
  staffImageUrl?: string;
  notes?: string;
}

const DEFAULT_BOOKING: BookingDetail = {
  id: 'b-default',
  clientId: '1',
  clientName: 'Nadia Osman',
  clientPhone: '+1 (555) 123-4567',
  clientImageUrl:
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
  clientHistoryText: 'Returning Client • 4 past visits',
  status: 'confirmed',
  bookedAt: 'Booked on Aug 18, 2023',
  dateText: 'Tue, Aug 25',
  timeText: '14:30 - 17:00',
  serviceName: 'Full Balayage & Toner',
  servicePrice: '$180.00',
  durationText: '2h 30m',
  categoryText: 'Color & Styling',
  staffName: 'Amara S.',
  staffImageUrl:
    'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&auto=format&fit=crop&q=80',
  notes:
    'Client requested a cooler ash tone this time. Please make sure to check patch test results from last visit. Prefers quiet appointment.',
};

const BOOKINGS_BY_ID: Record<string, BookingDetail> = {
  'appt-1': {
    ...DEFAULT_BOOKING,
    id: 'appt-1',
    clientId: '1',
    clientName: 'Sarah Jenkins',
    clientPhone: '+1 (555) 234-5678',
    clientImageUrl:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
    clientHistoryText: 'VIP Client • 14 past visits',
    status: 'confirmed',
    bookedAt: 'Booked on Oct 20, 2023',
    dateText: 'Today, Oct 24',
    timeText: '10:30 - 11:15',
    serviceName: 'Haircut & Styling',
    servicePrice: '$45.00',
    durationText: '45m',
    categoryText: 'Haircut & Styling',
    staffName: 'Sarah Jenkins',
    notes: 'Prefers organic styling products and light layers.',
  },
  'appt-2': {
    ...DEFAULT_BOOKING,
    id: 'appt-2',
    clientId: '2',
    clientName: 'Michael Chang',
    clientPhone: '+1 (555) 876-5432',
    clientImageUrl: undefined,
    clientHistoryText: 'New Client • 1st visit',
    status: 'pending',
    bookedAt: 'Booked on Oct 22, 2023',
    dateText: 'Today, Oct 24',
    timeText: '11:45 - 13:30',
    serviceName: 'Full Color & Blowout',
    servicePrice: '$120.00',
    durationText: '1h 45m',
    categoryText: 'Color & Treatment',
    staffName: 'Elena Rodriguez',
    notes: 'First-time coloring, patch test completed yesterday.',
  },
  'appt-3': {
    ...DEFAULT_BOOKING,
    id: 'appt-3',
    clientId: '3',
    clientName: 'Elena Rodriguez',
    clientPhone: '+1 (555) 345-6789',
    clientImageUrl: undefined,
    clientHistoryText: 'Returning Client • 6 past visits',
    status: 'confirmed',
    bookedAt: 'Booked on Oct 21, 2023',
    dateText: 'Today, Oct 24',
    timeText: '13:15 - 15:30',
    serviceName: 'Balayage & Treatment',
    servicePrice: '$180.00',
    durationText: '2h 15m',
    categoryText: 'Color & Styling',
    staffName: 'Michael Chang',
    notes: 'Maintain honey blonde tones, deep conditioning mask.',
  },
  'appt-4': {
    ...DEFAULT_BOOKING,
    id: 'appt-4',
    clientId: '4',
    clientName: 'David Kim',
    clientPhone: '+1 (555) 456-7890',
    clientImageUrl: undefined,
    clientHistoryText: 'Regular Client • 8 past visits',
    status: 'completed',
    bookedAt: 'Booked on Oct 19, 2023',
    dateText: 'Today, Oct 24',
    timeText: '14:45 - 15:15',
    serviceName: 'Beard Trim & Haircut',
    servicePrice: '$35.00',
    durationText: '30m',
    categoryText: 'Grooming',
    staffName: 'Sarah Jenkins',
    notes: 'Regular skin fade and beard shaping.',
  },
  h1: {
    ...DEFAULT_BOOKING,
    id: 'h1',
    dateText: 'Tue, Oct 24',
    timeText: '10:00 - 13:00',
    serviceName: 'Balayage & Styling',
    servicePrice: '$140.00',
    durationText: '180 min',
    staffName: 'Sarah Jenkins',
    status: 'confirmed',
  },
  h2: {
    ...DEFAULT_BOOKING,
    id: 'h2',
    dateText: 'Thu, Sep 12',
    timeText: '14:30 - 16:00',
    serviceName: 'Root Tint & Cut',
    servicePrice: '$95.00',
    durationText: '90 min',
    staffName: 'Sarah Jenkins',
    status: 'completed',
  },
  h3: {
    ...DEFAULT_BOOKING,
    id: 'h3',
    dateText: 'Wed, Jul 05',
    timeText: '09:00 - 12:30',
    serviceName: 'Full Head Highlights',
    servicePrice: '$160.00',
    durationText: '210 min',
    staffName: 'Emma Lawson',
    status: 'completed',
  },
  h4: {
    ...DEFAULT_BOOKING,
    id: 'h4',
    dateText: 'Mon, Jun 18',
    timeText: '11:00 - 11:45',
    serviceName: 'Blow Dry',
    servicePrice: '$45.00',
    durationText: '45 min',
    staffName: 'Amara S.',
    status: 'cancelled',
  },
};

export default function BookingDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();

  const [bookingStatus, setBookingStatus] =
    React.useState<BookingStatus>('confirmed');
  const [cancelDialogOpen, setCancelDialogOpen] = React.useState(false);

  const booking = React.useMemo(() => {
    const rawId = Array.isArray(id) ? id[0] : id;
    if (rawId && BOOKINGS_BY_ID[rawId]) {
      return BOOKINGS_BY_ID[rawId];
    }
    if (rawId) {
      return {
        ...DEFAULT_BOOKING,
        id: rawId,
      };
    }
    return DEFAULT_BOOKING;
  }, [id]);

  React.useEffect(() => {
    setBookingStatus(booking.status);
  }, [booking.status]);

  const handleMessage = () => {
    const digits = booking.clientPhone.replace(/\D/g, '');
    Linking.openURL(`https://wa.me/${digits}`).catch(() => {
      toast.info(`Opening WhatsApp chat for ${booking.clientName}`);
    });
  };

  const handleReschedule = () => {
    toast.info('Select a new date & time to reschedule');
    router.push('/calendar' as never);
  };

  const handleConfirmCancel = () => {
    setBookingStatus('cancelled');
    setCancelDialogOpen(false);
    toast.error('Booking has been cancelled');
    toast.info('Cancellation notice sent via WhatsApp');
  };

  const statusBadgeConfig = {
    confirmed: {
      bg: 'bg-primary/10',
      dot: 'bg-primary',
      text: 'text-primary',
      label: 'Confirmed',
    },
    pending: {
      bg: 'bg-status-pending-soft',
      dot: 'bg-status-pending',
      text: 'text-status-pending',
      label: 'Pending',
    },
    completed: {
      bg: 'bg-muted',
      dot: 'bg-muted-foreground',
      text: 'text-muted-foreground',
      label: 'Completed',
    },
    cancelled: {
      bg: 'bg-destructive/10',
      dot: 'bg-destructive',
      text: 'text-destructive',
      label: 'Cancelled',
    },
  }[bookingStatus];

  return (
    <Screen
      header={<Header title="Booking Detail" fallbackHref="/calendar" />}
      footer={
        <View className="gap-2.5">
          <View className="flex-row gap-2.5">
            {/* WhatsApp / Message Action */}
            <Pressable
              onPress={handleMessage}
              accessibilityRole="button"
              accessibilityLabel="Message on WhatsApp"
              className="border-primary bg-card active:bg-primary/5 h-12 flex-1 flex-row items-center justify-center gap-2 rounded-xl border shadow-sm"
            >
              <Icon as={MessageCircle} size={18} className="text-primary" />
              <Text className="text-primary text-base font-semibold">
                Message
              </Text>
            </Pressable>

            {/* Reschedule Action */}
            <Pressable
              onPress={handleReschedule}
              accessibilityRole="button"
              accessibilityLabel="Reschedule appointment"
              className="border-primary bg-card active:bg-primary/5 h-12 flex-1 flex-row items-center justify-center gap-2 rounded-xl border shadow-sm"
            >
              <Icon as={CalendarDays} size={18} className="text-primary" />
              <Text className="text-primary text-base font-semibold">
                Reschedule
              </Text>
            </Pressable>
          </View>

          {/* Cancel Action */}
          {bookingStatus !== 'cancelled' ? (
            <Pressable
              onPress={() => setCancelDialogOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Cancel appointment"
              className="border-destructive bg-card active:bg-destructive/5 h-12 w-full flex-row items-center justify-center gap-2 rounded-xl border shadow-sm"
            >
              <Icon as={XCircle} size={18} className="text-destructive" />
              <Text className="text-destructive text-base font-semibold">
                Cancel
              </Text>
            </Pressable>
          ) : (
            <View className="bg-destructive/10 h-12 w-full flex-row items-center justify-center gap-2 rounded-xl">
              <Text className="text-destructive text-sm font-semibold">
                This appointment is cancelled
              </Text>
            </View>
          )}
        </View>
      }
    >
      <View className="mx-auto w-full max-w-lg gap-4 pb-4 sm:max-w-xl">
        {/* Status Header Area */}
        <View className="items-center justify-center py-2">
          <View
            className={cn(
              'flex-row items-center gap-2 rounded-full px-4 py-1.5',
              statusBadgeConfig.bg,
            )}
          >
            <View
              className={cn('h-2 w-2 rounded-full', statusBadgeConfig.dot)}
            />
            <Text
              className={cn(
                'text-xs font-bold uppercase tracking-wider',
                statusBadgeConfig.text,
              )}
            >
              {statusBadgeConfig.label}
            </Text>
          </View>
          <Text className="text-muted-foreground mt-2 text-sm">
            {booking.bookedAt}
          </Text>
        </View>

        {/* Client Info Card */}
        <View className="bg-card border-border rounded-2xl border p-4 shadow-sm">
          <View className="flex-row items-start justify-between">
            <Pressable
              onPress={() =>
                router.push(`/clients/${booking.clientId}` as never)
              }
              accessibilityRole="button"
              accessibilityLabel={`View client profile for ${booking.clientName}`}
              className="flex-1 flex-row items-center gap-3.5 active:opacity-75"
            >
              <PersonAvatar
                name={booking.clientName}
                imageUrl={booking.clientImageUrl}
                size="lg"
              />
              <View className="flex-1">
                <Text className="text-foreground text-lg font-bold">
                  {booking.clientName}
                </Text>
                <View className="mt-1 flex-row items-center gap-1.5">
                  <Icon
                    as={Phone}
                    size={14}
                    className="text-muted-foreground"
                  />
                  <Text className="text-muted-foreground text-sm">
                    {booking.clientPhone}
                  </Text>
                </View>
              </View>
            </Pressable>

            <Pressable
              onPress={() =>
                router.push(`/clients/${booking.clientId}` as never)
              }
              accessibilityRole="button"
              accessibilityLabel="View Client Profile"
              className="bg-muted active:bg-accent h-10 w-10 items-center justify-center rounded-full"
              hitSlop={8}
            >
              <Icon as={User} size={18} className="text-primary" />
            </Pressable>
          </View>

          <View className="border-border mt-3 border-t pt-3">
            <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
              Client History
            </Text>
            <Text className="text-foreground mt-0.5 text-sm">
              {booking.clientHistoryText}
            </Text>
          </View>
        </View>

        {/* Date & Time Schedule Card */}
        <View className="bg-card border-border relative overflow-hidden rounded-2xl border p-4 shadow-sm">
          <View className="bg-primary/5 pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full" />

          <Text className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wider">
            Schedule
          </Text>

          <View className="mb-2 flex-row items-center gap-2">
            <Icon as={Calendar} size={20} className="text-primary" />
            <Text className="text-foreground text-lg font-bold">
              {booking.dateText}
            </Text>
          </View>

          <View className="flex-row items-center gap-2">
            <Icon as={Clock} size={20} className="text-primary" />
            <Text className="text-foreground text-xl font-bold">
              {booking.timeText}
            </Text>
          </View>
        </View>

        {/* Service Details Card */}
        <View className="border-l-primary border-border bg-card relative overflow-hidden rounded-2xl border border-l-4 p-4 shadow-sm">
          <View className="flex-row items-start justify-between">
            <View>
              <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                Service
              </Text>
              <Text className="text-foreground mt-0.5 text-lg font-bold">
                {booking.serviceName}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                Total
              </Text>
              <Text className="text-foreground mt-0.5 text-lg font-bold">
                {booking.servicePrice}
              </Text>
            </View>
          </View>

          <View className="my-3 flex-row items-center gap-3">
            <View className="flex-row items-center gap-1.5">
              <Icon as={Clock} size={15} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-sm font-medium">
                {booking.durationText}
              </Text>
            </View>
            <View className="bg-border h-1 w-1 rounded-full" />
            <View className="flex-row items-center gap-1.5">
              <Icon as={Scissors} size={15} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-sm font-medium">
                {booking.categoryText}
              </Text>
            </View>
          </View>

          {/* Assigned Staff */}
          <View className="bg-muted/40 border-border flex-row items-center gap-3 rounded-xl border p-3">
            <PersonAvatar
              name={booking.staffName}
              imageUrl={booking.staffImageUrl}
              size="sm"
            />
            <View>
              <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                Assigned Staff
              </Text>
              <Text className="text-foreground text-sm font-bold">
                {booking.staffName}
              </Text>
            </View>
          </View>
        </View>

        {/* Booking Notes Card */}
        {booking.notes ? (
          <View className="bg-card border-border rounded-2xl border p-4 shadow-sm">
            <Text className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wider">
              Booking Notes
            </Text>
            <View className="bg-muted/40 border-border rounded-xl border p-3.5">
              <Text className="text-muted-foreground text-sm italic leading-5">
                &ldquo;{booking.notes}&rdquo;
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* Cancellation Confirmation Dialog */}
      <ConfirmDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        title="Cancel Appointment?"
        description="Are you sure you want to cancel this booking? The slot will become available and the client will be notified via WhatsApp."
        confirmLabel="Yes, Cancel Booking"
        cancelLabel="Keep Appointment"
        destructive
        onConfirm={handleConfirmCancel}
      />
    </Screen>
  );
}
