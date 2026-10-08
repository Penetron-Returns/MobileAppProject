import { useRouter } from 'expo-router';
import { Check, ChevronDown, Clock, X } from 'lucide-react-native';
import * as React from 'react';
import { Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { Icon } from '@/components/ui/icon';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

export interface DaySchedule {
  key: string;
  label: string;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

const TIME_OPTIONS: string[] = [
  '06:00 AM',
  '06:30 AM',
  '07:00 AM',
  '07:30 AM',
  '08:00 AM',
  '08:30 AM',
  '09:00 AM',
  '09:30 AM',
  '10:00 AM',
  '10:30 AM',
  '11:00 AM',
  '11:30 AM',
  '12:00 PM',
  '12:30 PM',
  '01:00 PM',
  '01:30 PM',
  '02:00 PM',
  '02:30 PM',
  '03:00 PM',
  '03:30 PM',
  '04:00 PM',
  '04:30 PM',
  '05:00 PM',
  '05:30 PM',
  '06:00 PM',
  '06:30 PM',
  '07:00 PM',
  '07:30 PM',
  '08:00 PM',
  '08:30 PM',
  '09:00 PM',
  '09:30 PM',
  '10:00 PM',
];

const INITIAL_SCHEDULE: DaySchedule[] = [
  {
    key: 'mon',
    label: 'Monday',
    isOpen: true,
    openTime: '09:00 AM',
    closeTime: '06:00 PM',
  },
  {
    key: 'tue',
    label: 'Tuesday',
    isOpen: true,
    openTime: '09:00 AM',
    closeTime: '06:00 PM',
  },
  {
    key: 'wed',
    label: 'Wednesday',
    isOpen: true,
    openTime: '09:00 AM',
    closeTime: '06:00 PM',
  },
  {
    key: 'thu',
    label: 'Thursday',
    isOpen: true,
    openTime: '09:00 AM',
    closeTime: '06:00 PM',
  },
  {
    key: 'fri',
    label: 'Friday',
    isOpen: true,
    openTime: '09:00 AM',
    closeTime: '07:00 PM',
  },
  {
    key: 'sat',
    label: 'Saturday',
    isOpen: true,
    openTime: '09:00 AM',
    closeTime: '05:00 PM',
  },
  {
    key: 'sun',
    label: 'Sunday',
    isOpen: false,
    openTime: '09:00 AM',
    closeTime: '05:00 PM',
  },
];

interface TimePickerState {
  open: boolean;
  dayKey: string;
  dayLabel: string;
  field: 'open' | 'close';
  currentValue: string;
}

export default function OperatingHoursScreen() {
  const router = useRouter();
  const [schedule, setSchedule] =
    React.useState<DaySchedule[]>(INITIAL_SCHEDULE);
  const [isSaving, setIsSaving] = React.useState(false);
  const [pickerState, setPickerState] = React.useState<TimePickerState>({
    open: false,
    dayKey: '',
    dayLabel: '',
    field: 'open',
    currentValue: '',
  });

  const handleToggleDay = (key: string, value: boolean) => {
    setSchedule((prev) =>
      prev.map((day) => (day.key === key ? { ...day, isOpen: value } : day)),
    );
  };

  const openTimePicker = (
    dayKey: string,
    dayLabel: string,
    field: 'open' | 'close',
    currentValue: string,
  ) => {
    setPickerState({
      open: true,
      dayKey,
      dayLabel,
      field,
      currentValue,
    });
  };

  const handleSelectTime = (time: string) => {
    setSchedule((prev) =>
      prev.map((day) => {
        if (day.key !== pickerState.dayKey) return day;
        return {
          ...day,
          [pickerState.field === 'open' ? 'openTime' : 'closeTime']: time,
        };
      }),
    );
    setPickerState((prev) => ({ ...prev, open: false }));
  };

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      toast.success('Operating hours updated successfully');
    }, 400);
  };

  const handleCancel = () => {
    setSchedule(INITIAL_SCHEDULE);
    toast.info('Changes discarded');
    router.back();
  };

  return (
    <Screen
      header={<Header title="Operating Hours" fallbackHref="/settings" />}
      footer={
        <View className="gap-2.5">
          <Pressable
            onPress={handleCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel changes"
            className="border-primary bg-card active:bg-primary/5 h-12 w-full items-center justify-center rounded-xl border shadow-sm"
          >
            <Text className="text-primary text-base font-semibold">Cancel</Text>
          </Pressable>

          <Pressable
            onPress={handleSave}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel="Save Changes"
            className="bg-primary active:opacity-90 h-12 w-full flex-row items-center justify-center gap-2 rounded-xl shadow-md"
          >
            <Icon as={Check} size={18} className="text-primary-foreground" />
            <Text className="text-primary-foreground text-base font-semibold">
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Text>
          </Pressable>
        </View>
      }
    >
      <View className="mx-auto w-full max-w-lg gap-4 pb-4 sm:max-w-xl">
        <View className="mb-1">
          <Text className="text-muted-foreground text-sm leading-5">
            Set your salon&apos;s standard availability. These hours will be
            applied to your booking calendar.
          </Text>
        </View>

        {/* Days List */}
        <View className="gap-3">
          {schedule.map((day) => {
            if (day.isOpen) {
              return (
                <View
                  key={day.key}
                  className="bg-card border-border rounded-xl border p-4 shadow-sm"
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-foreground text-base font-bold">
                      {day.label}
                    </Text>
                    <View className="flex-row items-center gap-2.5">
                      <Text className="text-primary text-xs font-bold uppercase tracking-wider">
                        Open
                      </Text>
                      <Switch
                        value={day.isOpen}
                        onValueChange={(val) => handleToggleDay(day.key, val)}
                        trackColor={{ false: '#cbd5e1', true: '#006389' }}
                        accessibilityLabel={`Toggle ${day.label} open status`}
                      />
                    </View>
                  </View>

                  <View className="mt-3 flex-row items-center gap-2 pt-1 sm:justify-end">
                    {/* Open Time Selector */}
                    <Pressable
                      onPress={() =>
                        openTimePicker(day.key, day.label, 'open', day.openTime)
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`${day.label} opens at ${day.openTime}`}
                      className="border-border bg-muted/40 active:border-primary flex-1 flex-row items-center justify-between rounded-lg border px-3 py-2 sm:flex-initial sm:min-w-[124px]"
                    >
                      <View className="flex-row items-center gap-1.5">
                        <Icon
                          as={Clock}
                          size={14}
                          className="text-muted-foreground"
                        />
                        <Text className="text-foreground text-sm font-semibold">
                          {day.openTime}
                        </Text>
                      </View>
                      <Icon
                        as={ChevronDown}
                        size={16}
                        className="text-muted-foreground ml-1"
                      />
                    </Pressable>

                    <Text className="text-muted-foreground text-sm font-medium">
                      to
                    </Text>

                    {/* Close Time Selector */}
                    <Pressable
                      onPress={() =>
                        openTimePicker(
                          day.key,
                          day.label,
                          'close',
                          day.closeTime,
                        )
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`${day.label} closes at ${day.closeTime}`}
                      className="border-border bg-muted/40 active:border-primary flex-1 flex-row items-center justify-between rounded-lg border px-3 py-2 sm:flex-initial sm:min-w-[124px]"
                    >
                      <View className="flex-row items-center gap-1.5">
                        <Icon
                          as={Clock}
                          size={14}
                          className="text-muted-foreground"
                        />
                        <Text className="text-foreground text-sm font-semibold">
                          {day.closeTime}
                        </Text>
                      </View>
                      <Icon
                        as={ChevronDown}
                        size={16}
                        className="text-muted-foreground ml-1"
                      />
                    </Pressable>
                  </View>
                </View>
              );
            }

            // Closed day
            return (
              <View
                key={day.key}
                className="border-border/60 bg-muted/20 rounded-xl border border-dashed p-4 opacity-75"
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-muted-foreground text-base font-semibold">
                    {day.label}
                  </Text>
                  <View className="flex-row items-center gap-2.5">
                    <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                      Closed
                    </Text>
                    <Switch
                      value={day.isOpen}
                      onValueChange={(val) => handleToggleDay(day.key, val)}
                      trackColor={{ false: '#cbd5e1', true: '#006389' }}
                      accessibilityLabel={`Toggle ${day.label} open status`}
                    />
                  </View>
                </View>

                <View className="mt-2.5 flex-row items-center sm:justify-end">
                  <Text className="text-muted-foreground text-sm italic">
                    No hours set
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Time Picker Modal */}
      <Modal
        visible={pickerState.open}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setPickerState((prev) => ({ ...prev, open: false }))
        }
      >
        <Pressable
          onPress={() => setPickerState((prev) => ({ ...prev, open: false }))}
          className="bg-black/50 flex-1 items-center justify-center p-4"
        >
          <Pressable
            onPress={() => {}}
            className="border-border bg-card w-full max-w-sm overflow-hidden rounded-2xl border shadow-xl"
          >
            <View className="border-border flex-row items-center justify-between border-b p-4">
              <View>
                <Text className="text-foreground text-base font-bold">
                  {pickerState.field === 'open'
                    ? 'Opening Time'
                    : 'Closing Time'}
                </Text>
                <Text className="text-muted-foreground text-xs">
                  {pickerState.dayLabel}
                </Text>
              </View>
              <Pressable
                onPress={() =>
                  setPickerState((prev) => ({ ...prev, open: false }))
                }
                className="h-8 w-8 items-center justify-center rounded-full active:bg-accent"
                accessibilityRole="button"
                accessibilityLabel="Close time picker"
              >
                <Icon as={X} size={18} className="text-muted-foreground" />
              </Pressable>
            </View>

            <ScrollView className="max-h-80">
              {TIME_OPTIONS.map((time) => {
                const isSelected = pickerState.currentValue === time;
                return (
                  <Pressable
                    key={time}
                    onPress={() => handleSelectTime(time)}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${time}`}
                    className={cn(
                      'flex-row items-center justify-between p-3.5 active:bg-accent',
                      isSelected && 'bg-primary/5',
                    )}
                  >
                    <Text
                      className={cn(
                        'text-sm font-semibold',
                        isSelected ? 'text-primary' : 'text-foreground',
                      )}
                    >
                      {time}
                    </Text>
                    {isSelected ? (
                      <Icon as={Check} size={18} className="text-primary" />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}
