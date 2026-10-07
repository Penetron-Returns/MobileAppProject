import { useRouter } from 'expo-router';
import {
  AlertCircle,
  Bell,
  ChevronDown,
  ChevronRight,
  Plus,
  Users,
} from 'lucide-react-native';
import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { toast } from '@/lib/toast';

import { Header } from '@/components/Header';
import { PersonAvatar } from '@/components/PersonAvatar';
import { Screen } from '@/components/Screen';
import { SearchInput } from '@/components/SearchInput';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

type FilterTab = 'all' | 'recent' | 'vip';

interface ClientItem {
  id: string;
  name: string;
  phone: string;
  lastVisit: string;
  appointmentToday?: string;
  imageUrl?: string;
  online?: boolean;
  tags: FilterTab[];
}

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All Clients' },
  { id: 'recent', label: 'Recent' },
  { id: 'vip', label: 'VIP' },
];

const INITIAL_CLIENTS: ClientItem[] = [
  {
    id: '1',
    name: 'Sarah Jenkins',
    phone: '+1 (555) 234-5678',
    lastVisit: 'Last visit: 2 days ago',
    imageUrl:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
    online: true,
    tags: ['all', 'recent', 'vip'],
  },
  {
    id: '2',
    name: 'Michael Rodriguez',
    phone: '+1 (555) 876-5432',
    lastVisit: 'Last visit: Oct 15, 2023',
    tags: ['all', 'recent'],
  },
  {
    id: '3',
    name: 'David Chen',
    phone: '+1 (555) 345-6789',
    lastVisit: 'Last visit: Oct 12, 2023',
    appointmentToday: 'Appointment Today at 2:00 PM',
    imageUrl:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
    tags: ['all', 'recent', 'vip'],
  },
  {
    id: '4',
    name: 'Emma Lawson',
    phone: '+1 (555) 987-6543',
    lastVisit: 'Last visit: Sep 28, 2023',
    tags: ['all'],
  },
  {
    id: '5',
    name: 'Jessica Taylor',
    phone: '+1 (555) 456-7890',
    lastVisit: 'Last visit: Sep 14, 2023',
    tags: ['all', 'vip'],
  },
  {
    id: '6',
    name: 'Robert Johnson',
    phone: '+1 (555) 654-3210',
    lastVisit: 'Last visit: Aug 30, 2023',
    tags: ['all'],
  },
  {
    id: '7',
    name: 'Amanda White',
    phone: '+1 (555) 789-0123',
    lastVisit: 'Last visit: Aug 12, 2023',
    tags: ['all', 'recent'],
  },
  {
    id: '8',
    name: 'Marcus Vance',
    phone: '+1 (555) 321-9876',
    lastVisit: 'Last visit: Jul 22, 2023',
    tags: ['all', 'vip'],
  },
];

export default function ClientsScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<FilterTab>('all');
  const [visibleCount, setVisibleCount] = React.useState(4);

  const filteredClients = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return INITIAL_CLIENTS.filter((client) => {
      // Tab filter
      if (activeTab !== 'all' && !client.tags.includes(activeTab)) {
        return false;
      }
      // Search query
      if (q) {
        const matchesName = client.name.toLowerCase().includes(q);
        const matchesPhone = client.phone.toLowerCase().includes(q);
        return matchesName || matchesPhone;
      }
      return true;
    });
  }, [searchQuery, activeTab]);

  const displayedClients = React.useMemo(() => {
    return filteredClients.slice(0, visibleCount);
  }, [filteredClients, visibleCount]);

  const canLoadMore = visibleCount < filteredClients.length;

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + 4);
    toast.success('Loaded additional clients');
  };

  return (
    <Screen
      header={
        <Header
          title="Administrator"
          hideBack
          right={
            <Pressable
              onPress={() => toast.info('No new notifications')}
              className="relative h-10 w-10 items-center justify-center rounded-full active:bg-accent"
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              hitSlop={8}
            >
              <Icon as={Bell} size={20} className="text-foreground" />
              <View className="bg-destructive absolute right-2 top-2 h-2 w-2 rounded-full border border-background" />
            </Pressable>
          }
        />
      }
    >
      <View className="mx-auto w-full max-w-lg gap-5 pb-8 sm:max-w-2xl md:max-w-4xl">
        {/* Header Section */}
        <View className="flex-row items-end justify-between">
          <View>
            <Text className="text-foreground text-2xl font-bold sm:text-3xl">
              Clients
            </Text>
            <Text className="text-muted-foreground mt-0.5 text-sm">
              Manage your client relationships
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/add' as never)}
            accessibilityRole="button"
            accessibilityLabel="Add new client"
            className="bg-primary flex-row items-center gap-1.5 rounded-lg px-4 py-2.5 shadow-sm active:opacity-90"
          >
            <Icon as={Plus} size={18} className="text-primary-foreground" />
            <Text className="text-primary-foreground text-sm font-semibold">
              New
            </Text>
          </Pressable>
        </View>

        {/* Search Bar */}
        <SearchInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search clients by name or phone..."
          containerClassName="rounded-xl border-border bg-card shadow-sm"
        />

        {/* Filter Chips */}
        <View className="flex-row gap-2">
          {FILTER_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                onPress={() => {
                  setActiveTab(tab.id);
                  setVisibleCount(4);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                className={cn(
                  'rounded-full border px-4 py-1.5 transition-all',
                  isActive
                    ? 'border-primary/20 bg-primary/10'
                    : 'border-border bg-card active:bg-muted',
                )}
              >
                <Text
                  className={cn(
                    'text-xs font-semibold',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Client List */}
        {filteredClients.length === 0 ? (
          <View className="bg-card border-border items-center justify-center rounded-xl border p-8 shadow-sm">
            <Icon
              as={Users}
              size={36}
              className="text-muted-foreground/60 mb-2"
            />
            <Text className="text-foreground text-base font-semibold">
              No clients found
            </Text>
            <Text className="text-muted-foreground mt-1 text-center text-xs">
              {searchQuery
                ? `No clients matching "${searchQuery}". Try a different name or phone number.`
                : 'No clients found in this category.'}
            </Text>
          </View>
        ) : (
          <View className="bg-card border-border overflow-hidden rounded-xl border shadow-sm">
            {displayedClients.map((client, index) => {
              const isLast = index === displayedClients.length - 1;
              const hasTodayAppointment = Boolean(client.appointmentToday);

              return (
                <Pressable
                  key={client.id}
                  onPress={() => router.push(`/clients/${client.id}` as never)}
                  accessibilityRole="button"
                  accessibilityLabel={`${client.name}, ${client.appointmentToday ?? client.lastVisit}`}
                  className={cn(
                    'relative flex-row items-center p-4 active:bg-muted/50',
                    !isLast && 'border-border border-b',
                  )}
                >
                  {/* Left accent bar for clients with appointments today */}
                  {hasTodayAppointment ? (
                    <View className="bg-primary absolute bottom-0 left-0 top-0 w-1" />
                  ) : null}

                  <View className={cn(hasTodayAppointment && 'pl-1.5')}>
                    <PersonAvatar
                      name={client.name}
                      imageUrl={client.imageUrl}
                      online={client.online}
                    />
                  </View>

                  <View className="ml-3.5 flex-1">
                    <Text className="text-foreground text-base font-semibold">
                      {client.name}
                    </Text>
                    {hasTodayAppointment ? (
                      <View className="mt-0.5 flex-row items-center gap-1.5">
                        <Icon
                          as={AlertCircle}
                          size={14}
                          className="text-status-pending"
                        />
                        <Text className="text-status-pending text-xs font-semibold">
                          {client.appointmentToday}
                        </Text>
                      </View>
                    ) : (
                      <Text className="text-muted-foreground mt-0.5 text-xs">
                        {client.lastVisit}
                      </Text>
                    )}
                  </View>

                  <Icon
                    as={ChevronRight}
                    size={20}
                    className="text-muted-foreground/60"
                  />
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Load More Button */}
        {canLoadMore ? (
          <View className="flex-row justify-center pt-1">
            <Pressable
              onPress={handleLoadMore}
              accessibilityRole="button"
              accessibilityLabel="Load more clients"
              className="flex-row items-center gap-1 py-2 active:opacity-70"
            >
              <Text className="text-primary text-sm font-semibold">
                Load more clients
              </Text>
              <Icon as={ChevronDown} size={18} className="text-primary" />
            </Pressable>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
