import { router } from 'expo-router';

import { setCalendarViewMode } from './calendar';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Clock,
  MessageCircle,
  MoreVertical,
} from 'lucide-react-native';
import * as React from 'react';
import { Linking, Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Header } from '@/components/Header';
import { PersonAvatar } from '@/components/PersonAvatar';
import { Screen } from '@/components/Screen';
import { StatusBadge } from '@/components/StatusBadge';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAppColorScheme } from '@/hooks/useAppColorScheme';
import { toast } from '@/lib/toast';

export default function DashboardScreen() {
  const { colors } = useAppColorScheme();
  const [checkedIn, setCheckedIn] = React.useState(false);

  const handleCheckIn = () => {
    setCheckedIn(true);
    toast.success('Sarah Jenkins checked in', 'Appointment at 10:30 AM');
  };

  const handleWhatsApp = (phone: string, name: string) => {
    const text = encodeURIComponent(
      `Hi ${name}, confirming your appointment with us today.`,
    );
    Linking.openURL(`https://wa.me/${phone}?text=${text}`).catch(() => {
      toast.info(`Opening WhatsApp chat for ${name}`);
    });
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
      {/* Bento Grid for Stats */}
      <View className="gap-4">
        <View className="gap-4 md:flex-row">
          {/* Monthly Revenue Card */}
          <View className="bg-card border-border h-48 flex-1 justify-between rounded-2xl border p-4 shadow-sm">
            <View>
              <Text className="text-muted-foreground mb-1 text-xs font-bold uppercase tracking-wider">
                Monthly Revenue
              </Text>
              <Text className="text-foreground text-3xl font-bold">
                $12,450
              </Text>
            </View>
            <View className="h-16 w-full overflow-hidden">
              <Svg
                width="100%"
                height="100%"
                viewBox="0 0 100 30"
                preserveAspectRatio="none"
              >
                <Path
                  d="M0 30 L0 25 L10 20 L20 28 L30 15 L40 22 L50 10 L60 18 L70 5 L80 12 L90 2 L100 8 L100 30 Z"
                  fill={colors.primary}
                  fillOpacity={0.12}
                />
                <Path
                  d="M0 25 L10 20 L20 28 L30 15 L40 22 L50 10 L60 18 L70 5 L80 12 L90 2 L100 8"
                  fill="none"
                  stroke={colors.primary}
                  strokeWidth={2}
                />
              </Svg>
            </View>
          </View>

          {/* Today's Bookings Card */}
          <View className="bg-card border-border h-48 flex-1 justify-between rounded-2xl border p-4 shadow-sm">
            <View>
              <Text className="text-muted-foreground mb-1 text-xs font-bold uppercase tracking-wider">
                Today's Bookings
              </Text>
              <Text className="text-foreground text-3xl font-bold">14</Text>
            </View>
            <View className="flex-row flex-wrap gap-2">
              <View className="bg-status-confirmed-soft rounded-full px-2.5 py-1">
                <Text className="text-status-confirmed text-xs font-semibold">
                  8 Confirmed
                </Text>
              </View>
              <View className="bg-status-pending-soft rounded-full px-2.5 py-1">
                <Text className="text-status-pending text-xs font-semibold">
                  2 Pending
                </Text>
              </View>
              <View className="bg-status-completed-soft rounded-full px-2.5 py-1">
                <Text className="text-status-completed text-xs font-semibold">
                  4 Completed
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Next Appointment Highlight Card */}
        <View className="bg-primary relative min-h-[196px] justify-between overflow-hidden rounded-2xl p-5 shadow-md">
          {/* Ambient decorative blur circle */}
          <View className="pointer-events-none absolute -right-6 -top-6 h-36 w-36 rounded-full bg-white/10" />

          <View className="z-10">
            <View className="mb-1 flex-row items-center gap-1.5">
              <Icon
                as={Clock}
                size={14}
                className="text-primary-foreground/90"
              />
              <Text className="text-primary-foreground/90 text-xs font-bold uppercase tracking-wider">
                Next Appointment
              </Text>
            </View>
            <Text className="text-primary-foreground text-3xl font-bold">
              10:30 AM
            </Text>
            <Text className="text-primary-foreground/95 mt-1 text-base font-semibold">
              Sarah Jenkins
            </Text>
            <Text className="text-primary-foreground/80 mt-0.5 text-sm">
              Deep Tissue Massage · 60m
            </Text>
          </View>

          <Pressable
            onPress={handleCheckIn}
            className="z-10 mt-4 flex-row items-center gap-2 self-start rounded-lg bg-white/20 px-4 py-2 active:bg-white/30"
            accessibilityRole="button"
          >
            <Icon as={CheckCircle2} size={16} className="text-white" />
            <Text className="text-xs font-semibold text-white">
              {checkedIn ? 'Checked In' : 'Check In'}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Today's Schedule Section */}
      <View className="mt-4">
        <View className="mb-3 flex-row items-end justify-between">
          <Text className="text-foreground text-lg font-bold">
            Today's Schedule
          </Text>
          <Pressable
            onPress={() => {
              setCalendarViewMode('day');
              router.push({
                pathname: '/calendar',
                params: { view: 'day', t: String(Date.now()) },
              } as never);
            }}
            accessibilityRole="button"
            accessibilityLabel="View Today's Schedule in Calendar"
            hitSlop={8}
          >
            <Text className="text-primary text-xs font-bold uppercase tracking-wider">
              View All
            </Text>
          </Pressable>
        </View>

        <View className="bg-card border-border divide-border overflow-hidden rounded-2xl border divide-y shadow-sm">
          {/* Item 1 - Completed */}
          <Pressable
            onPress={() => router.push('/bookings/appt-1' as never)}
            className="h-[76px] flex-row items-center px-4 active:bg-accent/40"
          >
            <View className="mr-3 w-12 items-center">
              <Text className="text-muted-foreground text-xs font-medium">
                09:00
              </Text>
            </View>
            <PersonAvatar
              name="Emma Thompson"
              imageUrl="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80"
              size="md"
              className="mr-3"
            />
            <View className="flex-1 justify-center">
              <Text numberOfLines={1} className="text-sm font-semibold">
                Emma Thompson
              </Text>
              <Text numberOfLines={1} className="text-muted-foreground text-xs">
                Signature Facial · 60m
              </Text>
            </View>
            <View className="ml-3 flex-row items-center gap-2">
              <StatusBadge status="completed" />
              <View className="h-8 w-8 items-center justify-center rounded-full">
                <Icon
                  as={MoreVertical}
                  size={18}
                  className="text-muted-foreground"
                />
              </View>
            </View>
          </Pressable>

          {/* Item 2 - Up Next (Highlighted with accent bar) */}
          <Pressable
            onPress={() => router.push('/bookings/appt-2' as never)}
            className="relative h-[76px] flex-row items-center px-4 active:bg-accent/40"
          >
            <View className="bg-primary absolute bottom-0 left-0 top-0 w-1 rounded-r" />
            <View className="mr-3 w-12 items-center">
              <Text className="text-primary text-xs font-bold">10:30</Text>
            </View>
            <PersonAvatar
              name="Sarah Jenkins"
              solid
              size="md"
              className="mr-3"
            />
            <View className="flex-1 justify-center">
              <Text numberOfLines={1} className="text-sm font-semibold">
                Sarah Jenkins
              </Text>
              <Text numberOfLines={1} className="text-muted-foreground text-xs">
                Deep Tissue Massage · 60m
              </Text>
            </View>
            <View className="ml-3 flex-row items-center gap-2">
              <View className="bg-primary/10 rounded-full px-2.5 py-0.5">
                <Text className="text-primary text-xs font-semibold">Next</Text>
              </View>
              <View className="h-8 w-8 items-center justify-center rounded-full">
                <Icon
                  as={MoreVertical}
                  size={18}
                  className="text-muted-foreground"
                />
              </View>
            </View>
          </Pressable>

          {/* Item 3 - Confirmed with WhatsApp */}
          <Pressable
            onPress={() => router.push('/bookings/appt-3' as never)}
            className="h-[76px] flex-row items-center px-4 active:bg-accent/40"
          >
            <View className="mr-3 w-12 items-center">
              <Text className="text-muted-foreground text-xs font-medium">
                13:00
              </Text>
            </View>
            <PersonAvatar
              name="Michael Chen"
              imageUrl="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80"
              size="md"
              className="mr-3"
            />
            <View className="flex-1 justify-center">
              <Text numberOfLines={1} className="text-sm font-semibold">
                Michael Chen
              </Text>
              <Text numberOfLines={1} className="text-muted-foreground text-xs">
                Acupuncture · 45m
              </Text>
            </View>
            <View className="ml-3 flex-row items-center gap-1">
              <Pressable
                onPress={() => handleWhatsApp('27825550101', 'Michael Chen')}
                accessibilityLabel="Message on WhatsApp"
                className="h-8 w-8 items-center justify-center rounded-full active:bg-accent"
                hitSlop={8}
              >
                <Icon as={MessageCircle} size={18} className="text-whatsapp" />
              </Pressable>
              <View className="h-8 w-8 items-center justify-center rounded-full">
                <Icon
                  as={MoreVertical}
                  size={18}
                  className="text-muted-foreground"
                />
              </View>
            </View>
          </Pressable>

          {/* Item 4 - Urgent / Needs Confirmation */}
          <Pressable
            onPress={() => router.push('/bookings/appt-4' as never)}
            className="bg-destructive/5 h-[76px] flex-row items-center px-4 active:bg-destructive/10"
          >
            <View className="mr-3 w-12 items-center">
              <Text className="text-destructive text-xs font-bold">14:15</Text>
            </View>
            <PersonAvatar name="Laura Martinez" size="md" className="mr-3" />
            <View className="flex-1 justify-center">
              <Text numberOfLines={1} className="text-sm font-semibold">
                Laura Martinez
              </Text>
              <View className="flex-row items-center gap-1">
                <Icon as={AlertCircle} size={12} className="text-destructive" />
                <Text
                  numberOfLines={1}
                  className="text-destructive text-xs font-medium"
                >
                  Needs Confirmation
                </Text>
              </View>
            </View>
            <View className="ml-3 flex-row items-center gap-2">
              <View className="bg-status-pending-soft rounded-full px-2.5 py-0.5">
                <Text className="text-status-pending text-xs font-semibold">
                  Urgent
                </Text>
              </View>
              <View className="h-8 w-8 items-center justify-center rounded-full">
                <Icon
                  as={MoreVertical}
                  size={18}
                  className="text-muted-foreground"
                />
              </View>
            </View>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
