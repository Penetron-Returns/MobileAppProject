import { Chip, Input, Surface, SwitchRow, Text } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useAvailableSlots } from '@/features/appointments/hooks';
import type { StaffRow } from '@/features/catalog/hooks';
import {
  businessDate,
  formatDateShort,
  formatTime,
  type ISODate,
} from '@/lib/time';

import { closestSlots } from '../logic';
import { SlotPicker, type PickedSlot } from './SlotPicker';

export interface WhenState {
  staffId: string | null;
  date: ISODate | null;
  picked: PickedSlot | null;
  notes: string;
  sendWhatsApp: boolean;
}

/** Step 2: staff or "Any", live day and time chips, note and confirmation toggle. */
export function WhenStep({
  state,
  onChange,
  serviceId,
  staff,
  timezone,
  today,
  horizonDays,
  firstName,
  preferredTime,
  takenAt,
  onTakenDismiss,
}: {
  state: WhenState;
  onChange: (patch: Partial<WhenState>) => void;
  serviceId: string;
  staff: StaffRow[];
  timezone: string;
  today: ISODate;
  horizonDays: number;
  firstName: string;
  /** `HH:mm` from a calendar long-press: picked once when that slot is free. */
  preferredTime?: string | null;
  /** The start that was just booked by someone else, if the last attempt hit a conflict. */
  takenAt: string | null;
  onTakenDismiss: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-5">
      {takenAt ? (
        <SlotTakenCard
          serviceId={serviceId}
          staffId={state.staffId}
          takenAt={takenAt}
          timezone={timezone}
          selected={state.picked?.startsAt ?? null}
          onPick={(picked) => {
            onChange({ picked });
            onTakenDismiss();
          }}
        />
      ) : null}

      {staff.length > 1 ? (
        <View className="gap-2">
          <Text className="text-subtitle font-semibold text-muted-foreground">
            {t('newBooking.staff')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <Chip
              label={t('newBooking.anyStaff')}
              selected={state.staffId === null}
              onPress={() => onChange({ staffId: null, picked: null })}
            />
            {staff.map((s) => (
              <Chip
                key={s.id}
                label={s.name}
                selected={state.staffId === s.id}
                onPress={() => onChange({ staffId: s.id, picked: null })}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View className="gap-2">
        <Text role="heading" aria-level="2" className="text-section font-bold">
          {t('newBooking.when')}
        </Text>
        <SlotPicker
          serviceId={serviceId}
          staffId={state.staffId}
          timezone={timezone}
          today={today}
          horizonDays={horizonDays}
          date={state.date}
          onDateChange={(date) => onChange({ date })}
          selected={state.picked?.startsAt ?? null}
          onSelect={(picked) => onChange({ picked })}
          preferredTime={preferredTime}
        />
      </View>

      <SwitchRow
        variant="card"
        title={t('newBooking.sendConfirmation', { name: firstName })}
        checked={state.sendWhatsApp}
        onCheckedChange={(sendWhatsApp) => onChange({ sendWhatsApp })}
      />
      <View className="gap-1.5">
        <Text className="text-subtitle font-semibold text-muted-foreground">
          {t('newBooking.note')}
        </Text>
        <Input
          value={state.notes}
          onChangeText={(notes) => onChange({ notes })}
          placeholder={t('newBooking.notePlaceholder')}
          accessibilityLabel={t('newBooking.note')}
        />
      </View>
    </View>
  );
}

/** "That time was just booked": the three closest times still free, one tap to take one. */
function SlotTakenCard({
  serviceId,
  staffId,
  takenAt,
  timezone,
  selected,
  onPick,
}: {
  serviceId: string;
  staffId: string | null;
  takenAt: string;
  timezone: string;
  selected: string | null;
  onPick: (slot: PickedSlot) => void;
}) {
  const { t } = useTranslation();
  const day = businessDate(takenAt, timezone);
  const slots = useAvailableSlots({ serviceId, date: day, staffId });
  // A previous day's slots (kept while this one loads) are not options.
  const loading = slots.isPending || slots.isPlaceholderData;
  const options = loading
    ? []
    : closestSlots(
        (slots.data?.slots ?? []).filter((s) => s.starts_at !== takenAt),
        takenAt,
      );
  const when = `${formatDateShort(day)} ${formatTime(takenAt, timezone)}`;
  return (
    <Surface
      variant="hero"
      accessibilityRole="alert"
      className="gap-2 px-4 py-4"
    >
      <Text className="text-title font-semibold">
        {t('newBooking.taken.title', { when })}
      </Text>
      <Text className="text-subtitle text-muted-foreground">
        {loading || options.length > 0
          ? t('newBooking.taken.closest')
          : t('newBooking.taken.none')}
      </Text>
      {options.map((slot) => (
        <Chip
          key={slot.starts_at}
          label={formatTime(slot.starts_at, timezone)}
          selected={selected === slot.starts_at}
          onPress={() =>
            onPick({ startsAt: slot.starts_at, staffIds: slot.staff_ids })
          }
        />
      ))}
    </Surface>
  );
}
