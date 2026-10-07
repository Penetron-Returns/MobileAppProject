import { useClerk, useOrganization, useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import {
  Bell,
  Building2,
  ChevronRight,
  Clock,
  LogOut,
  MessageCircle,
  Moon,
  Pencil,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react-native';
import * as React from 'react';
import { Pressable, Switch, Text, View } from 'react-native';

import { Header } from '@/components/Header';
import { PersonAvatar } from '@/components/PersonAvatar';
import { Screen } from '@/components/Screen';
import { Icon } from '@/components/ui/icon';
import { useAppColorScheme } from '@/hooks/useAppColorScheme';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

const BUSINESS_SETTINGS = [
  {
    id: 'business-details',
    title: 'Business Details',
    subtitle: 'Name, address, contact',
    icon: Building2,
    href: '/settings/business-details',
  },
  {
    id: 'operating-hours',
    title: 'Operating Hours',
    subtitle: 'Availability and time-offs',
    icon: Clock,
    href: '/settings/operating-hours',
  },
  {
    id: 'services',
    title: 'Services',
    subtitle: 'Menu and pricing',
    icon: Sparkles,
    href: '/settings/services',
  },
  {
    id: 'staff-management',
    title: 'Staff Management',
    subtitle: 'Team members and roles',
    icon: Users,
    href: '/settings/staff-management',
  },
] as const;

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut } = useClerk();
  const { user } = useUser();
  const { organization } = useOrganization();
  const { isDark, toggle: toggleColorScheme } = useAppColorScheme();

  const [pushEnabled, setPushEnabled] = React.useState(true);

  const displayName =
    user?.fullName || user?.firstName || organization?.name || 'Admin User';
  const displayEmail =
    user?.primaryEmailAddress?.emailAddress || 'admin@beautywellness.co';
  const displayImage =
    user?.imageUrl ||
    'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=240&auto=format&fit=crop&q=80';

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch {
      toast.info('Signed out');
    }
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
      <View className="mx-auto w-full max-w-lg gap-5 sm:max-w-xl">
        {/* Profile Card */}
        <View className="bg-card border-border flex-col items-center rounded-2xl border p-6 text-center shadow-sm">
          <View className="relative mb-3">
            <PersonAvatar
              name={displayName}
              imageUrl={displayImage}
              size="xl"
            />
            <Pressable
              onPress={() => toast.info('Edit avatar')}
              accessibilityRole="button"
              accessibilityLabel="Edit profile picture"
              className="bg-primary absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-full shadow-sm active:opacity-90"
            >
              <Icon as={Pencil} size={15} className="text-primary-foreground" />
            </Pressable>
          </View>

          <Text className="text-foreground text-xl font-bold">
            {displayName}
          </Text>
          <Text className="text-muted-foreground mt-0.5 text-sm">
            {displayEmail}
          </Text>

          <View className="bg-primary/10 mt-3 flex-row items-center gap-1.5 rounded-full px-3 py-1">
            <Icon as={ShieldCheck} size={14} className="text-primary" />
            <Text className="text-primary text-xs font-semibold">
              {organization?.name ? `${organization.name} • Owner` : 'Owner'}
            </Text>
          </View>
        </View>

        {/* Preferences Card */}
        <View className="bg-card border-border overflow-hidden rounded-2xl border shadow-sm">
          <View className="border-border border-b px-5 py-3.5">
            <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
              Preferences
            </Text>
          </View>

          <View className="gap-4 p-5">
            {/* Dark Mode Toggle */}
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <View className="bg-muted h-10 w-10 items-center justify-center rounded-xl">
                  <Icon as={Moon} size={20} className="text-muted-foreground" />
                </View>
                <View>
                  <Text className="text-foreground text-base font-semibold">
                    Dark Mode
                  </Text>
                  <Text className="text-muted-foreground text-xs">
                    Toggle appearance
                  </Text>
                </View>
              </View>
              <Switch
                value={isDark}
                onValueChange={toggleColorScheme}
                trackColor={{ false: '#cbd5e1', true: '#006389' }}
                accessibilityLabel="Toggle Dark Mode"
              />
            </View>

            {/* Push Notifications Toggle */}
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <View className="bg-muted h-10 w-10 items-center justify-center rounded-xl">
                  <Icon as={Bell} size={20} className="text-muted-foreground" />
                </View>
                <View>
                  <Text className="text-foreground text-base font-semibold">
                    Push Notifications
                  </Text>
                  <Text className="text-muted-foreground text-xs">
                    For appointments
                  </Text>
                </View>
              </View>
              <Switch
                value={pushEnabled}
                onValueChange={(val) => {
                  setPushEnabled(val);
                  toast.info(
                    `Push notifications ${val ? 'enabled' : 'disabled'}`,
                  );
                }}
                trackColor={{ false: '#cbd5e1', true: '#006389' }}
                accessibilityLabel="Toggle Push Notifications"
              />
            </View>
          </View>
        </View>

        {/* Business Settings Card */}
        <View className="bg-card border-border overflow-hidden rounded-2xl border shadow-sm">
          <View className="border-border border-b px-5 py-3.5">
            <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
              Business Settings
            </Text>
          </View>

          <View>
            {BUSINESS_SETTINGS.map((item, index) => {
              const isLast = index === BUSINESS_SETTINGS.length - 1;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => router.push(item.href as never)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}, ${item.subtitle}`}
                  className={cn(
                    'active:bg-muted/50 flex-row items-center justify-between p-4',
                    !isLast && 'border-border border-b',
                  )}
                >
                  <View className="flex-row items-center gap-3.5">
                    <View className="bg-primary/10 h-10 w-10 items-center justify-center rounded-full">
                      <Icon as={item.icon} size={20} className="text-primary" />
                    </View>
                    <View>
                      <Text className="text-foreground text-base font-semibold">
                        {item.title}
                      </Text>
                      <Text className="text-muted-foreground text-xs">
                        {item.subtitle}
                      </Text>
                    </View>
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
        </View>

        {/* Integrations Card */}
        <View className="bg-card border-border overflow-hidden rounded-2xl border shadow-sm">
          <View className="border-border border-b px-5 py-3.5">
            <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
              Integrations
            </Text>
          </View>

          <View className="p-4">
            <View className="border-border bg-muted/30 flex-row items-center justify-between rounded-xl border p-4">
              <View className="flex-1 flex-row items-center gap-3">
                <View className="bg-whatsapp/15 h-12 w-12 items-center justify-center rounded-full">
                  <Icon
                    as={MessageCircle}
                    size={24}
                    className="text-whatsapp"
                  />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-1.5">
                    <Text className="text-foreground text-base font-semibold">
                      WhatsApp API
                    </Text>
                    <View className="bg-success h-2 w-2 rounded-full" />
                  </View>
                  <Text className="text-muted-foreground text-xs">
                    Connected for client alerts
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={() =>
                  toast.info('WhatsApp Cloud API is connected and verified.')
                }
                accessibilityRole="button"
                accessibilityLabel="Configure WhatsApp API"
                className="border-primary/30 active:bg-primary/10 rounded-lg border px-3 py-1.5"
              >
                <Text className="text-primary text-xs font-semibold">
                  Configure
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Log Out Button */}
        <Pressable
          onPress={handleSignOut}
          accessibilityRole="button"
          accessibilityLabel="Log Out"
          className="border-destructive/40 active:bg-destructive/10 flex-row items-center justify-center gap-2 rounded-xl border py-3.5"
        >
          <Icon as={LogOut} size={18} className="text-destructive" />
          <Text className="text-destructive text-base font-semibold">
            Log Out
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
