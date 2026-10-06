import { router } from 'expo-router';
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Utensils,
} from 'lucide-react-native';
import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Header } from '@/components/Header';
import { PersonAvatar } from '@/components/PersonAvatar';
import { Screen } from '@/components/Screen';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function formatDate(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatWeekday(d: Date): string {
  return WEEKDAYS[d.getDay()];
}

function getStartOfWeek(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay(); // 0 is Sunday, 1 is Monday...
  const diff = (day === 0 ? -6 : 1) - day; // Monday start
  date.setDate(date.getDate() + diff);
  return date;
}

function getEndOfWeek(d: Date): Date {
  const start = getStartOfWeek(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end;
}

function formatWeekRange(d: Date): { title: string; subtitle: string } {
  const start = getStartOfWeek(d);
  const end = getEndOfWeek(d);
  const startMonth = MONTHS[start.getMonth()].slice(0, 3);
  const endMonth = MONTHS[end.getMonth()].slice(0, 3);

  let title: string;
  if (start.getFullYear() !== end.getFullYear()) {
    title = `${startMonth} ${start.getDate()}, ${start.getFullYear()} – ${endMonth} ${end.getDate()}, ${end.getFullYear()}`;
  } else if (start.getMonth() === end.getMonth()) {
    title = `${MONTHS[start.getMonth()]} ${start.getDate()} – ${end.getDate()}, ${start.getFullYear()}`;
  } else {
    title = `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}, ${start.getFullYear()}`;
  }

  const subtitle = `Week of ${startMonth} ${start.getDate()}`;
  return { title, subtitle };
}

const HOURS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'];

const POSITION_CLASSES: Record<string, string> = {
  '09:00-10:15': 'top-[0px] h-[120px]',
  '09:30-10:45': 'top-[48px] h-[72px]',
  '09:30-11:00': 'top-[48px] h-[144px]',
  '10:00-11:15': 'top-[96px] h-[120px]',
  '10:00-11:30': 'top-[96px] h-[144px]',
  '10:30-12:00': 'top-[144px] h-[144px]',
  '11:00-12:30': 'top-[192px] h-[144px]',
  '11:30-12:30': 'top-[240px] h-[96px]',
  '11:30-12:45': 'top-[240px] h-[120px]',
  '12:30-13:30': 'top-[336px] h-[96px]',
  '13:00-14:00': 'top-[384px] h-[96px]',
  '13:30-14:45': 'top-[432px] h-[120px]',
  '13:30-15:00': 'top-[432px] h-[144px]',
  '14:00-15:00': 'top-[480px] h-[96px]',
  '14:00-15:15': 'top-[480px] h-[120px]',
};

interface WeekBookingItem {
  id: string;
  service: string;
  client: string;
  time: string;
  positionClass: string;
  status: 'confirmed' | 'pending';
}

const WEEKLY_SCHEDULE: Record<
  number,
  {
    bookings: WeekBookingItem[];
    hasLunchBreak?: boolean;
  }
> = {
  1: {
    // Monday
    bookings: [
      {
        id: 'appt-mon-1',
        service: 'Balayage & Styling',
        client: 'Emma Thompson',
        time: '10:00 - 11:30',
        positionClass: 'top-[96px] h-[144px]',
        status: 'confirmed',
      },
      {
        id: 'appt-mon-2',
        service: 'Blowout & Style',
        client: 'Jessica Miller',
        time: '14:00 - 15:00',
        positionClass: 'top-[480px] h-[96px]',
        status: 'confirmed',
      },
    ],
    hasLunchBreak: true,
  },
  2: {
    // Tuesday (matches Day view)
    bookings: [
      {
        id: 'appt-1',
        service: 'Haircut & Styling',
        client: 'Sarah Jenkins',
        time: '09:30 - 10:45',
        positionClass: 'top-[48px] h-[72px]',
        status: 'confirmed',
      },
      {
        id: 'appt-2',
        service: 'Full Color & Blowout',
        client: 'Michael Chang',
        time: '11:00 - 12:30',
        positionClass: 'top-[192px] h-[144px]',
        status: 'confirmed',
      },
      {
        id: 'appt-tue-3',
        service: 'Beard Trim',
        client: 'David Ross',
        time: '14:00 - 15:00',
        positionClass: 'top-[480px] h-[96px]',
        status: 'pending',
      },
    ],
    hasLunchBreak: true,
  },
  3: {
    // Wednesday
    bookings: [
      {
        id: 'appt-wed-1',
        service: "Men's Fade",
        client: 'Alex Rivera',
        time: '09:00 - 10:15',
        positionClass: 'top-[0px] h-[120px]',
        status: 'confirmed',
      },
      {
        id: 'appt-wed-2',
        service: 'Keratin Treatment',
        client: 'Olivia Taylor',
        time: '10:30 - 12:00',
        positionClass: 'top-[144px] h-[144px]',
        status: 'confirmed',
      },
      {
        id: 'appt-wed-3',
        service: 'Signature Facial',
        client: 'Chloe Martin',
        time: '13:30 - 14:45',
        positionClass: 'top-[432px] h-[120px]',
        status: 'confirmed',
      },
    ],
    hasLunchBreak: true,
  },
  4: {
    // Thursday
    bookings: [
      {
        id: 'appt-thu-1',
        service: 'Deep Tissue Massage',
        client: 'Robert Wilson',
        time: '10:00 - 11:15',
        positionClass: 'top-[96px] h-[120px]',
        status: 'confirmed',
      },
      {
        id: 'appt-thu-2',
        service: 'Haircut & Beard',
        client: 'James Moore',
        time: '11:30 - 12:30',
        positionClass: 'top-[240px] h-[96px]',
        status: 'confirmed',
      },
      {
        id: 'appt-thu-3',
        service: 'Full Color & Foil',
        client: 'Sophia Davis',
        time: '14:00 - 15:15',
        positionClass: 'top-[480px] h-[120px]',
        status: 'confirmed',
      },
    ],
    hasLunchBreak: true,
  },
  5: {
    // Friday
    bookings: [
      {
        id: 'appt-fri-1',
        service: 'Bridal Trial',
        client: 'Emily Clark',
        time: '09:30 - 11:00',
        positionClass: 'top-[48px] h-[144px]',
        status: 'confirmed',
      },
      {
        id: 'appt-fri-2',
        service: 'Express Blowout',
        client: 'Amanda White',
        time: '11:30 - 12:30',
        positionClass: 'top-[240px] h-[96px]',
        status: 'confirmed',
      },
      {
        id: 'appt-fri-3',
        service: 'Highlights & Gloss',
        client: 'Lucas Anderson',
        time: '13:30 - 15:00',
        positionClass: 'top-[432px] h-[144px]',
        status: 'confirmed',
      },
    ],
    hasLunchBreak: true,
  },
  6: {
    // Saturday
    bookings: [
      {
        id: 'appt-sat-1',
        service: 'Haircut & Styling',
        client: 'Hannah Scott',
        time: '10:00 - 11:15',
        positionClass: 'top-[96px] h-[120px]',
        status: 'confirmed',
      },
      {
        id: 'appt-sat-2',
        service: 'Beard Trim & Facial',
        client: 'Chris Evans',
        time: '11:30 - 12:45',
        positionClass: 'top-[240px] h-[120px]',
        status: 'confirmed',
      },
      {
        id: 'appt-sat-3',
        service: 'Blowout Session',
        client: 'Megan Fox',
        time: '13:00 - 14:00',
        positionClass: 'top-[384px] h-[96px]',
        status: 'confirmed',
      },
    ],
    hasLunchBreak: false,
  },
  0: {
    // Sunday - Closed
    bookings: [],
    hasLunchBreak: false,
  },
};

export default function CalendarScreen() {
  const [currentDate, setCurrentDate] = React.useState(
    () => new Date(2023, 9, 24), // October 24, 2023 as in mockup
  );
  const [viewMode, setViewMode] = React.useState<'day' | 'week' | 'month'>(
    'day',
  );

  const goToPrev = () => {
    if (viewMode === 'week') {
      setCurrentDate((d) => {
        const next = new Date(d);
        next.setDate(next.getDate() - 7);
        return next;
      });
    } else {
      setCurrentDate((d) => {
        const next = new Date(d);
        next.setDate(next.getDate() - 1);
        return next;
      });
    }
  };

  const goToNext = () => {
    if (viewMode === 'week') {
      setCurrentDate((d) => {
        const next = new Date(d);
        next.setDate(next.getDate() + 7);
        return next;
      });
    } else {
      setCurrentDate((d) => {
        const next = new Date(d);
        next.setDate(next.getDate() + 1);
        return next;
      });
    }
  };

  const goToToday = () => {
    setCurrentDate(new Date(2023, 9, 24));
    toast.info(
      viewMode === 'week'
        ? 'Viewing week of October 23, 2023'
        : 'Viewing October 24, 2023',
    );
  };

  const dateInfo = React.useMemo(() => {
    if (viewMode === 'week') {
      return formatWeekRange(currentDate);
    }
    return {
      title: formatDate(currentDate),
      subtitle: formatWeekday(currentDate),
    };
  }, [currentDate, viewMode]);

  const weekDays = React.useMemo(() => {
    const start = getStartOfWeek(currentDate);
    return Array.from({ length: 7 }, (_, i) => {
      const dayDate = new Date(start);
      dayDate.setDate(dayDate.getDate() + i);
      const dayOfWeek = dayDate.getDay();
      const isToday =
        dayDate.getFullYear() === currentDate.getFullYear() &&
        dayDate.getMonth() === currentDate.getMonth() &&
        dayDate.getDate() === currentDate.getDate();

      const schedule = WEEKLY_SCHEDULE[dayOfWeek] || {
        bookings: [],
        hasLunchBreak: false,
      };

      return {
        key: `${dayDate.getFullYear()}-${dayDate.getMonth()}-${dayDate.getDate()}`,
        date: dayDate,
        dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek],
        fullDayName: WEEKDAYS[dayOfWeek],
        dateNumber: dayDate.getDate(),
        isToday,
        isClosed: dayOfWeek === 0,
        bookings: schedule.bookings,
        bookingsCount: schedule.bookings.length,
        hasLunchBreak: schedule.hasLunchBreak,
      };
    });
  }, [currentDate]);

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
      {/* Controls & Date Header */}
      <View className="gap-3">
        <View className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Date Picker Controls */}
          <View className="flex-row items-center gap-2">
            <View className="flex-row items-center gap-1">
              <Pressable
                onPress={goToPrev}
                className="h-9 w-9 items-center justify-center rounded-full active:bg-accent"
                accessibilityRole="button"
                accessibilityLabel={
                  viewMode === 'week' ? 'Previous week' : 'Previous day'
                }
                hitSlop={8}
              >
                <Icon as={ChevronLeft} size={20} className="text-foreground" />
              </Pressable>
              <View className="items-center px-1">
                <Text className="text-foreground text-xl font-bold">
                  {dateInfo.title}
                </Text>
                <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-widest">
                  {dateInfo.subtitle}
                </Text>
              </View>
              <Pressable
                onPress={goToNext}
                className="h-9 w-9 items-center justify-center rounded-full active:bg-accent"
                accessibilityRole="button"
                accessibilityLabel={
                  viewMode === 'week' ? 'Next week' : 'Next day'
                }
                hitSlop={8}
              >
                <Icon as={ChevronRight} size={20} className="text-foreground" />
              </Pressable>
            </View>

            <Pressable
              onPress={goToToday}
              className="rounded-full border border-border px-3.5 py-1.5 active:bg-accent"
              accessibilityRole="button"
            >
              <Text className="text-primary text-xs font-semibold">Today</Text>
            </Pressable>
          </View>

          {/* View Switcher (Day / Week / Month) */}
          <View className="w-full items-center sm:w-auto">
            <View className="bg-muted flex-row self-center rounded-full p-1">
              <Pressable
                onPress={() => setViewMode('day')}
                className={cn(
                  'rounded-full px-5 py-1.5',
                  viewMode === 'day'
                    ? 'bg-primary shadow-sm'
                    : 'active:bg-accent/50',
                )}
                accessibilityRole="button"
                accessibilityLabel="Day view"
              >
                <Text
                  className={cn(
                    'text-xs font-semibold',
                    viewMode === 'day'
                      ? 'text-primary-foreground'
                      : 'text-muted-foreground',
                  )}
                >
                  Day
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setViewMode('week')}
                className={cn(
                  'rounded-full px-5 py-1.5',
                  viewMode === 'week'
                    ? 'bg-primary shadow-sm'
                    : 'active:bg-accent/50',
                )}
                accessibilityRole="button"
                accessibilityLabel="Week view"
              >
                <Text
                  className={cn(
                    'text-xs font-semibold',
                    viewMode === 'week'
                      ? 'text-primary-foreground'
                      : 'text-muted-foreground',
                  )}
                >
                  Week
                </Text>
              </Pressable>
              <Pressable
                onPress={() => toast.info('Month view coming soon')}
                className="rounded-full px-5 py-1.5 active:bg-accent/50"
                accessibilityRole="button"
                accessibilityLabel="Month view"
              >
                <Text className="text-muted-foreground text-xs font-semibold">
                  Month
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {/* Main Timeline View (Day vs Week) */}
      {viewMode === 'day' ? (
        /* Daily Timeline Grid Container */
        <View className="bg-card border-border relative min-h-[720px] overflow-hidden rounded-2xl border shadow-sm">
          {/* Background Hour Lines */}
          <View className="absolute inset-0 bottom-8 top-4 flex-col">
            {HOURS.map((hour) => (
              <View key={hour} className="relative h-24 flex-row">
                <View className="w-14 items-end pr-3 pt-1">
                  <Text className="text-muted-foreground text-xs font-medium">
                    {hour}
                  </Text>
                </View>
                <View className="border-border flex-1 border-b border-dashed" />
              </View>
            ))}
          </View>

          {/* Booking Blocks Overlay */}
          <View className="absolute bottom-8 left-14 right-3 top-4 sm:right-6">
            {/* Booking 1: 09:30 - 10:45 */}
            <Pressable
              onPress={() => router.push('/bookings/appt-1' as never)}
              className="bg-card border-border active:border-primary absolute left-0 right-0 top-[48px] ml-1.5 h-[72px] flex-row overflow-hidden rounded-xl border shadow-sm"
              accessibilityRole="button"
              accessibilityLabel="Haircut & Styling with Sarah Jenkins"
            >
              {/* Priority Bar */}
              <View className="bg-primary h-full w-1.5 flex-shrink-0" />
              <View className="flex-1 justify-center p-3">
                <View className="mb-1 flex-row items-start justify-between">
                  <Text
                    numberOfLines={1}
                    className="text-foreground flex-1 pr-2 text-sm font-semibold"
                  >
                    Haircut & Styling
                  </Text>
                  <View className="bg-primary/10 rounded px-2 py-0.5">
                    <Text className="text-primary text-[10px] font-bold uppercase tracking-wide">
                      Confirmed
                    </Text>
                  </View>
                </View>
                <View className="flex-row items-center gap-2">
                  <Text className="text-muted-foreground text-xs font-medium">
                    Sarah Jenkins
                  </Text>
                  <View className="bg-muted-foreground h-1 w-1 rounded-full" />
                  <Text className="text-muted-foreground text-xs font-medium">
                    09:30 - 10:45
                  </Text>
                </View>
              </View>
              <View className="w-10 items-center justify-center">
                <Icon as={Pencil} size={16} className="text-muted-foreground" />
              </View>
            </Pressable>

            {/* Booking 2: 11:00 - 12:30 */}
            <Pressable
              onPress={() => router.push('/bookings/appt-2' as never)}
              className="bg-card border-border active:border-primary absolute left-0 right-0 top-[192px] ml-1.5 h-[144px] flex-row overflow-hidden rounded-xl border shadow-sm"
              accessibilityRole="button"
              accessibilityLabel="Full Color & Blowout with Michael Chang"
            >
              {/* Priority Bar */}
              <View className="bg-primary h-full w-1.5 flex-shrink-0" />
              <View className="flex-1 justify-between p-3">
                <View>
                  <View className="mb-1 flex-row items-start justify-between">
                    <Text
                      numberOfLines={1}
                      className="text-foreground flex-1 pr-2 text-sm font-semibold"
                    >
                      Full Color & Blowout
                    </Text>
                    <View className="bg-primary/10 rounded px-2 py-0.5">
                      <Text className="text-primary text-[10px] font-bold uppercase tracking-wide">
                        Confirmed
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Text className="text-muted-foreground text-xs font-medium">
                      Michael Chang
                    </Text>
                    <View className="bg-muted-foreground h-1 w-1 rounded-full" />
                    <Text className="text-muted-foreground text-xs font-medium">
                      11:00 - 12:30
                    </Text>
                  </View>
                </View>

                {/* Extra detail for larger block */}
                <View className="flex-row items-center gap-2">
                  <PersonAvatar
                    name="Michael Chang"
                    imageUrl="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80"
                    size="sm"
                  />
                  <Text className="text-muted-foreground text-xs font-medium">
                    First time client
                  </Text>
                </View>
              </View>
              <View className="w-10 items-center justify-center">
                <Icon as={Pencil} size={16} className="text-muted-foreground" />
              </View>
            </Pressable>

            {/* Lunch Break: 12:30 - 13:30 */}
            <View className="bg-accent/40 border-border absolute left-0 right-0 top-[336px] ml-1.5 h-[96px] flex-row items-center justify-center gap-2 rounded-xl border border-dashed">
              <Icon as={Utensils} size={16} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-xs font-bold uppercase tracking-widest">
                Lunch Break
              </Text>
            </View>
          </View>
        </View>
      ) : (
        /* Weekly Timeline Grid Container */
        <View className="bg-card border-border relative min-h-[720px] overflow-hidden rounded-2xl border shadow-sm">
          <View className="flex-row">
            {/* Left Column: Fixed hour labels with corner header */}
            <View className="border-border bg-card z-10 w-14 flex-shrink-0 border-r">
              <View className="border-border h-16 items-center justify-center border-b">
                <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                  Time
                </Text>
              </View>
              <View className="pb-8 pt-4">
                {HOURS.map((hour) => (
                  <View key={hour} className="h-24 items-end pr-3 pt-1">
                    <Text className="text-muted-foreground text-xs font-medium">
                      {hour}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Scrollable Day Columns */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
              className="flex-1"
            >
              <View className="flex-col">
                {/* Day Headers Row */}
                <View className="border-border bg-muted/20 h-16 flex-row border-b">
                  {weekDays.map((day) => (
                    <Pressable
                      key={day.key}
                      onPress={() => {
                        setCurrentDate(day.date);
                        setViewMode('day');
                      }}
                      className={cn(
                        'border-border w-[140px] items-center justify-center border-r px-1 py-2 active:bg-accent/40',
                        day.isToday && 'bg-primary/5',
                      )}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${day.fullDayName} ${day.dateNumber}`}
                    >
                      <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-wider">
                        {day.dayName}
                      </Text>
                      <View
                        className={cn(
                          'mt-0.5 h-7 w-7 items-center justify-center rounded-full',
                          day.isToday && 'bg-primary',
                        )}
                      >
                        <Text
                          className={cn(
                            'text-sm font-bold',
                            day.isToday
                              ? 'text-primary-foreground'
                              : 'text-foreground',
                          )}
                        >
                          {day.dateNumber}
                        </Text>
                      </View>
                      {day.bookingsCount > 0 ? (
                        <Text className="text-muted-foreground text-[10px] font-medium">
                          {day.bookingsCount}{' '}
                          {day.bookingsCount === 1 ? 'appt' : 'appts'}
                        </Text>
                      ) : (
                        <Text className="text-muted-foreground/60 text-[10px]">
                          {day.isClosed ? 'Closed' : 'Free'}
                        </Text>
                      )}
                    </Pressable>
                  ))}
                </View>

                {/* Timeline Columns Grid */}
                <View className="relative min-h-[672px] flex-row pb-8 pt-4">
                  {weekDays.map((day) => (
                    <View
                      key={day.key}
                      className={cn(
                        'border-border relative h-[672px] w-[140px] border-r',
                        day.isClosed && 'bg-muted/10',
                      )}
                    >
                      {/* Background dashed hour lines for this day */}
                      <View className="absolute inset-0">
                        {HOURS.map((hour) => (
                          <View
                            key={hour}
                            className="border-border h-24 border-b border-dashed"
                          />
                        ))}
                      </View>

                      {/* Sunday / Closed overlay */}
                      {day.isClosed ? (
                        <View className="absolute inset-0 items-center justify-center">
                          <View className="bg-muted/40 rounded-full px-3 py-1">
                            <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                              Closed
                            </Text>
                          </View>
                        </View>
                      ) : null}

                      {/* Day Bookings Overlay */}
                      <View className="absolute inset-0 px-1">
                        {day.bookings.map((booking) => (
                          <Pressable
                            key={booking.id}
                            onPress={() =>
                              router.push(`/bookings/${booking.id}` as never)
                            }
                            className={cn(
                              'bg-card border-border active:border-primary absolute left-1 right-1 flex-row overflow-hidden rounded-xl border shadow-sm',
                              booking.positionClass,
                            )}
                            accessibilityRole="button"
                            accessibilityLabel={`${booking.service} with ${booking.client}`}
                          >
                            {/* Priority Accent Bar */}
                            <View
                              className={cn(
                                'h-full w-1 flex-shrink-0',
                                booking.status === 'confirmed'
                                  ? 'bg-primary'
                                  : 'bg-muted-foreground',
                              )}
                            />
                            <View className="flex-1 justify-between p-2">
                              <View>
                                <Text
                                  numberOfLines={1}
                                  className="text-foreground pr-1 text-xs font-semibold"
                                >
                                  {booking.service}
                                </Text>
                                <Text
                                  numberOfLines={1}
                                  className="text-muted-foreground text-[11px] font-medium"
                                >
                                  {booking.client}
                                </Text>
                              </View>
                              <View className="mt-1 flex-row items-center justify-between">
                                <Text className="text-muted-foreground text-[10px]">
                                  {booking.time}
                                </Text>
                                <View
                                  className={cn(
                                    'rounded px-1.5 py-0.5',
                                    booking.status === 'confirmed'
                                      ? 'bg-primary/10'
                                      : 'bg-muted',
                                  )}
                                >
                                  <Text
                                    className={cn(
                                      'text-[9px] font-bold uppercase tracking-wide',
                                      booking.status === 'confirmed'
                                        ? 'text-primary'
                                        : 'text-muted-foreground',
                                    )}
                                  >
                                    {booking.status === 'confirmed'
                                      ? 'Conf'
                                      : 'Pend'}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          </Pressable>
                        ))}

                        {/* Lunch Break block */}
                        {day.hasLunchBreak ? (
                          <View
                            className={cn(
                              'bg-accent/40 border-border absolute left-1 right-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-dashed opacity-75',
                              POSITION_CLASSES['12:30-13:30'],
                            )}
                          >
                            <Icon
                              as={Utensils}
                              size={14}
                              className="text-muted-foreground"
                            />
                            <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                              Lunch
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      )}
    </Screen>
  );
}
