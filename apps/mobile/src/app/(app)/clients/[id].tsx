import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  Clock,
  Coffee,
  Mail,
  MessageCircle,
  MoreVertical,
  Pencil,
  Phone,
  Smartphone,
} from 'lucide-react-native';
import * as React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { Header } from '@/components/Header';
import { PersonAvatar } from '@/components/PersonAvatar';
import { Screen } from '@/components/Screen';
import { Icon } from '@/components/ui/icon';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

interface ClientNote {
  id: string;
  type: 'warning' | 'preference';
  text: string;
}

interface HistoryItem {
  id: string;
  month: string;
  day: string;
  service: string;
  status: 'upcoming' | 'completed' | 'canceled';
  details: string;
  price: string;
}

interface ClientProfile {
  id: string;
  name: string;
  joined: string;
  phone: string;
  email: string;
  imageUrl?: string;
  online?: boolean;
  notes: ClientNote[];
  stats: {
    visits: string;
    spent: string;
    avgSpend: string;
    cancellations: string;
  };
  history: HistoryItem[];
}

const DEFAULT_HISTORY: HistoryItem[] = [
  {
    id: 'h1',
    month: 'OCT',
    day: '24',
    service: 'Balayage & Styling',
    status: 'upcoming',
    details: 'Thu, 10:00 AM • 180 min • with Sarah',
    price: '£140',
  },
  {
    id: 'h2',
    month: 'SEP',
    day: '12',
    service: 'Root Tint & Cut',
    status: 'completed',
    details: 'Thu, 14:30 PM • 90 min • with Sarah',
    price: '£95',
  },
  {
    id: 'h3',
    month: 'JUL',
    day: '05',
    service: 'Full Head Highlights',
    status: 'completed',
    details: 'Wed, 09:00 AM • 210 min • with Emma',
    price: '£160',
  },
  {
    id: 'h4',
    month: 'JUN',
    day: '18',
    service: 'Blow Dry',
    status: 'canceled',
    details: 'Mon, 11:00 AM • 45 min',
    price: '£45',
  },
];

const DEFAULT_CLIENT: ClientProfile = {
  id: 'nadia',
  name: 'Nadia Osman',
  joined: 'Joined Mar 2023',
  phone: '+44 7700 900077',
  email: 'nadia.osman@example.com',
  imageUrl:
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80',
  online: true,
  notes: [
    {
      id: 'n1',
      type: 'warning',
      text: 'Highly sensitive scalp. Use only sulfate-free organic shampoo range (Green Bottle).',
    },
    {
      id: 'n2',
      type: 'preference',
      text: 'Prefers sparkling water with lemon. Enjoys reading during processing time.',
    },
  ],
  stats: {
    visits: '14',
    spent: 'R1.2k',
    avgSpend: '£85',
    cancellations: '0%',
  },
  history: DEFAULT_HISTORY,
};

const PROFILES_BY_ID: Record<string, ClientProfile> = {
  '1': {
    ...DEFAULT_CLIENT,
    id: '1',
    name: 'Sarah Jenkins',
    phone: '+1 (555) 234-5678',
    email: 'sarah.jenkins@example.com',
  },
  '2': {
    ...DEFAULT_CLIENT,
    id: '2',
    name: 'Michael Rodriguez',
    joined: 'Joined May 2023',
    phone: '+1 (555) 876-5432',
    email: 'michael.rodriguez@example.com',
    imageUrl: undefined,
    online: false,
    stats: {
      visits: '6',
      spent: 'R640',
      avgSpend: '£70',
      cancellations: '5%',
    },
  },
  '3': {
    ...DEFAULT_CLIENT,
    id: '3',
    name: 'David Chen',
    joined: 'Joined Jun 2023',
    phone: '+1 (555) 345-6789',
    email: 'david.chen@example.com',
    imageUrl:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
    stats: {
      visits: '10',
      spent: 'R950',
      avgSpend: '£95',
      cancellations: '0%',
    },
  },
  '4': {
    ...DEFAULT_CLIENT,
    id: '4',
    name: 'Emma Lawson',
    phone: '+1 (555) 987-6543',
    email: 'emma.lawson@example.com',
    imageUrl: undefined,
    online: false,
  },
  '5': {
    ...DEFAULT_CLIENT,
    id: '5',
    name: 'Jessica Taylor',
    phone: '+1 (555) 456-7890',
    email: 'jessica.taylor@example.com',
    imageUrl: undefined,
    online: false,
  },
  '6': {
    ...DEFAULT_CLIENT,
    id: '6',
    name: 'Robert Johnson',
    phone: '+1 (555) 654-3210',
    email: 'robert.johnson@example.com',
    imageUrl: undefined,
    online: false,
  },
  '7': {
    ...DEFAULT_CLIENT,
    id: '7',
    name: 'Amanda White',
    phone: '+1 (555) 789-0123',
    email: 'amanda.white@example.com',
    imageUrl: undefined,
    online: false,
  },
  '8': {
    ...DEFAULT_CLIENT,
    id: '8',
    name: 'Marcus Vance',
    phone: '+1 (555) 321-9876',
    email: 'marcus.vance@example.com',
    imageUrl: undefined,
    online: false,
  },
};

export default function ClientDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const [showAllHistory, setShowAllHistory] = React.useState(false);

  const client = React.useMemo(() => {
    const rawId = Array.isArray(id) ? id[0] : id;
    if (rawId && PROFILES_BY_ID[rawId]) {
      return PROFILES_BY_ID[rawId];
    }
    if (rawId) {
      return {
        ...DEFAULT_CLIENT,
        id: rawId,
        name: `Client #${rawId}`,
      };
    }
    return DEFAULT_CLIENT;
  }, [id]);

  const handleMessage = () => {
    const digits = client.phone.replace(/\D/g, '');
    Linking.openURL(`https://wa.me/${digits}`).catch(() => {
      toast.info(`Opening WhatsApp chat for ${client.name}`);
    });
  };

  const handleCall = () => {
    const digits = client.phone.replace(/\D/g, '');
    Linking.openURL(`tel:${digits}`).catch(() => {
      toast.info(`Calling ${client.name}`);
    });
  };

  const handleBook = () => {
    router.push('/add' as never);
  };

  const handleEdit = () => {
    toast.info(`Edit profile for ${client.name}`);
  };

  const handleBookingPress = (bookingId: string) => {
    router.push(`/bookings/${bookingId}` as never);
  };

  const displayedHistory = showAllHistory
    ? client.history
    : client.history.slice(0, 3);

  return (
    <Screen
      header={
        <Header
          title="Client Profile"
          fallbackHref="/clients"
          right={
            <Pressable
              onPress={handleEdit}
              accessibilityRole="button"
              accessibilityLabel="Edit Profile"
              className="bg-muted h-10 w-10 items-center justify-center rounded-full active:bg-accent"
              hitSlop={8}
            >
              <Icon as={Pencil} size={18} className="text-primary" />
            </Pressable>
          }
        />
      }
    >
      <View className="mx-auto w-full max-w-lg gap-6 pb-8 sm:max-w-2xl md:max-w-4xl">
        {/* Hero Section: Profile Summary Card */}
        <View className="bg-card border-border relative overflow-hidden rounded-2xl border p-6 shadow-sm">
          {/* Subtle decorative background circle */}
          <View className="bg-primary/10 pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full" />

          <View className="relative z-10 flex-col items-center gap-4 sm:flex-row sm:items-start">
            {/* Avatar */}
            <PersonAvatar
              name={client.name}
              imageUrl={client.imageUrl}
              size="xl"
              online={client.online}
            />

            {/* Info & Quick Actions */}
            <View className="flex-1 items-center sm:items-start">
              <Text className="text-foreground text-center text-2xl font-bold tracking-tight sm:text-left">
                {client.name}
              </Text>
              <Text className="text-muted-foreground mt-0.5 text-sm">
                {client.joined}
              </Text>

              {/* Quick Action Buttons */}
              <View className="mt-4 flex-row flex-wrap justify-center gap-2.5 sm:justify-start">
                <Pressable
                  onPress={handleMessage}
                  accessibilityRole="button"
                  accessibilityLabel="Message on WhatsApp"
                  className="bg-whatsapp flex-row items-center gap-2 rounded-xl px-4 py-2.5 shadow-sm active:opacity-90"
                >
                  <Icon as={MessageCircle} size={18} className="text-white" />
                  <Text className="text-sm font-semibold text-white">
                    Message
                  </Text>
                </Pressable>

                <Pressable
                  onPress={handleCall}
                  accessibilityRole="button"
                  accessibilityLabel="Call client"
                  className="bg-primary flex-row items-center gap-2 rounded-xl px-4 py-2.5 shadow-sm active:opacity-90"
                >
                  <Icon
                    as={Phone}
                    size={18}
                    className="text-primary-foreground"
                  />
                  <Text className="text-primary-foreground text-sm font-semibold">
                    Call
                  </Text>
                </Pressable>

                <Pressable
                  onPress={handleBook}
                  accessibilityRole="button"
                  accessibilityLabel="Book appointment"
                  className="bg-card border-border flex-row items-center gap-2 rounded-xl border px-4 py-2.5 shadow-sm active:bg-muted"
                >
                  <Icon as={Calendar} size={18} className="text-foreground" />
                  <Text className="text-foreground text-sm font-semibold">
                    Book
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>

        {/* Contact Details Card */}
        <View className="bg-card border-border rounded-2xl border p-5 shadow-sm">
          <View className="mb-4 flex-row items-center gap-2">
            <Icon as={Smartphone} size={20} className="text-primary" />
            <Text className="text-foreground text-lg font-bold">
              Contact Details
            </Text>
          </View>

          <View className="gap-3">
            <Pressable
              onPress={handleCall}
              accessibilityRole="button"
              accessibilityLabel={`Call ${client.phone}`}
              className="active:bg-muted/50 flex-row items-center gap-3 rounded-xl p-2"
            >
              <View className="bg-muted h-10 w-10 items-center justify-center rounded-full">
                <Icon as={Smartphone} size={18} className="text-foreground" />
              </View>
              <View className="flex-1">
                <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
                  Mobile
                </Text>
                <Text className="text-foreground text-base font-medium">
                  {client.phone}
                </Text>
              </View>
            </Pressable>

            <Pressable
              onPress={() => {
                Linking.openURL(`mailto:${client.email}`).catch(() => {
                  toast.info(`Email: ${client.email}`);
                });
              }}
              accessibilityRole="button"
              accessibilityLabel={`Email ${client.email}`}
              className="active:bg-muted/50 flex-row items-center gap-3 rounded-xl p-2"
            >
              <View className="bg-muted h-10 w-10 items-center justify-center rounded-full">
                <Icon as={Mail} size={18} className="text-foreground" />
              </View>
              <View className="flex-1">
                <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
                  Email
                </Text>
                <Text className="text-foreground text-base font-medium">
                  {client.email}
                </Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* Important Notes Card */}
        <View className="bg-card border-border border-t-status-pending relative overflow-hidden rounded-2xl border border-t-4 p-5 shadow-sm">
          <View className="mb-3 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Icon
                as={AlertTriangle}
                size={20}
                className="text-status-pending"
              />
              <Text className="text-foreground text-lg font-bold">
                Important Notes
              </Text>
            </View>
            <Pressable
              onPress={() => toast.info('Edit notes')}
              accessibilityRole="button"
              accessibilityLabel="Edit notes"
              className="p-1 active:opacity-70"
            >
              <Icon as={Pencil} size={16} className="text-muted-foreground" />
            </Pressable>
          </View>

          <View className="gap-2.5">
            {client.notes.map((note) => {
              const isWarning = note.type === 'warning';
              return (
                <View
                  key={note.id}
                  className="bg-muted/40 border-border flex-row gap-3 rounded-xl border p-3"
                >
                  <Icon
                    as={isWarning ? AlertTriangle : Coffee}
                    size={18}
                    className={
                      isWarning ? 'text-status-pending' : 'text-primary'
                    }
                  />
                  <Text className="text-foreground/90 flex-1 text-sm leading-5">
                    {note.text}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Stats Grid */}
        <View className="flex-row flex-wrap gap-3">
          <View className="bg-card border-border min-w-[45%] flex-1 items-center justify-center rounded-2xl border p-4 shadow-sm">
            <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
              Total Visits
            </Text>
            <Text className="text-primary mt-1 text-2xl font-bold">
              {client.stats.visits}
            </Text>
          </View>

          <View className="bg-card border-border min-w-[45%] flex-1 items-center justify-center rounded-2xl border p-4 shadow-sm">
            <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
              Total Spent
            </Text>
            <Text className="text-primary mt-1 text-2xl font-bold">
              {client.stats.spent}
            </Text>
          </View>

          <View className="bg-card border-border min-w-[45%] flex-1 items-center justify-center rounded-2xl border p-4 shadow-sm">
            <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
              Avg Spend
            </Text>
            <Text className="text-foreground mt-1 text-2xl font-bold">
              {client.stats.avgSpend}
            </Text>
          </View>

          <View className="bg-card border-border relative min-w-[45%] flex-1 items-center justify-center overflow-hidden rounded-2xl border p-4 shadow-sm">
            <View className="bg-success absolute bottom-0 right-0 top-0 w-1 rounded-r-2xl" />
            <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
              Cancellations
            </Text>
            <Text className="text-foreground mt-1 text-2xl font-bold">
              {client.stats.cancellations}
            </Text>
          </View>
        </View>

        {/* Booking History Section */}
        <View className="bg-card border-border overflow-hidden rounded-2xl border shadow-sm">
          <View className="border-border flex-row items-center justify-between border-b p-5">
            <View className="flex-row items-center gap-2">
              <Icon as={Clock} size={20} className="text-primary" />
              <Text className="text-foreground text-lg font-bold">
                Booking History
              </Text>
            </View>
            <Pressable
              onPress={() => setShowAllHistory((prev) => !prev)}
              accessibilityRole="button"
              accessibilityLabel="Toggle history view"
            >
              <Text className="text-primary text-sm font-semibold">
                {showAllHistory ? 'Show Less' : 'View All'}
              </Text>
            </Pressable>
          </View>

          <View>
            {displayedHistory.map((item, index) => {
              const isLast = index === displayedHistory.length - 1;
              const isUpcoming = item.status === 'upcoming';
              const isCanceled = item.status === 'canceled';

              return (
                <View
                  key={item.id}
                  className={cn(
                    'relative flex-row items-center gap-3.5 p-4',
                    !isLast && 'border-border border-b',
                    isCanceled && 'opacity-70',
                  )}
                >
                  {/* Priority Indicator for upcoming */}
                  {isUpcoming ? (
                    <View className="bg-success absolute bottom-0 left-0 top-0 w-1 rounded-r" />
                  ) : null}

                  {/* Clickable Appointment Content */}
                  <Pressable
                    onPress={() => handleBookingPress(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.service}, ${item.status}, ${item.price}`}
                    className="flex-1 flex-row items-center gap-3.5 active:opacity-75"
                  >
                    {/* Date badge */}
                    <View
                      className={cn(
                        'bg-muted border-border h-14 w-14 shrink-0 items-center justify-center rounded-xl border',
                        isUpcoming && 'border-success/30',
                      )}
                    >
                      <Text className="text-primary text-[10px] font-bold uppercase">
                        {item.month}
                      </Text>
                      <Text className="text-foreground text-base font-bold leading-none">
                        {item.day}
                      </Text>
                    </View>

                    {/* Info */}
                    <View className="min-w-0 flex-1">
                      <View className="mb-0.5 flex-row items-center gap-2">
                        <Text
                          numberOfLines={1}
                          className={cn(
                            'text-foreground text-base font-semibold',
                            isCanceled && 'line-through text-muted-foreground',
                          )}
                        >
                          {item.service}
                        </Text>

                        {/* Status Tag */}
                        <View
                          className={cn(
                            'rounded-full px-2 py-0.5',
                            isUpcoming &&
                              'bg-success/15 border-success/30 border',
                            item.status === 'completed' && 'bg-muted',
                            isCanceled &&
                              'bg-destructive/15 border-destructive/30 border',
                          )}
                        >
                          <Text
                            className={cn(
                              'text-[10px] font-bold uppercase',
                              isUpcoming && 'text-success',
                              item.status === 'completed' &&
                                'text-muted-foreground',
                              isCanceled && 'text-destructive',
                            )}
                          >
                            {item.status}
                          </Text>
                        </View>
                      </View>

                      <Text
                        numberOfLines={1}
                        className="text-muted-foreground text-xs"
                      >
                        {item.details}
                      </Text>
                    </View>

                    {/* Price */}
                    <Text
                      className={cn(
                        'text-foreground text-sm font-semibold',
                        isCanceled && 'line-through text-muted-foreground',
                      )}
                    >
                      {item.price}
                    </Text>
                  </Pressable>

                  {/* More options button */}
                  <Pressable
                    onPress={() => toast.info(`Options for ${item.service}`)}
                    accessibilityRole="button"
                    accessibilityLabel="More options"
                    hitSlop={8}
                    className="active:bg-accent rounded-full p-1"
                  >
                    <Icon
                      as={MoreVertical}
                      size={18}
                      className="text-muted-foreground"
                    />
                  </Pressable>
                </View>
              );
            })}
          </View>

          {/* Footer toggle button */}
          {!showAllHistory && client.history.length > 3 ? (
            <Pressable
              onPress={() => setShowAllHistory(true)}
              accessibilityRole="button"
              accessibilityLabel="Load More History"
              className="bg-muted/30 active:bg-muted/60 border-border flex-row items-center justify-center gap-1.5 border-t py-3"
            >
              <Text className="text-primary text-xs font-semibold">
                Load More History
              </Text>
              <Icon as={ChevronDown} size={16} className="text-primary" />
            </Pressable>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
