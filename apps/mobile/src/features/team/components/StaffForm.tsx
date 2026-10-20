import {
  Button,
  Chip,
  DestructiveRow,
  FormSheet,
  Group,
  GroupBlock,
  InlineInsetInput,
  SectionTitle,
  Switch,
  Text,
} from '@booking/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { Controller, useForm, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import {
  useSaveStaff,
  type ServiceRow,
  type StaffRow,
} from '@/features/catalog/hooks';
import {
  staffSchema,
  toCreateStaffRequest,
  toStaffFields,
  type StaffValues,
} from '@/features/settings/schemas';
import { applyApiFieldErrors } from '@/lib/form-errors';
import { toast } from '@/lib/toast';

const API_FIELDS = {
  name: 'name',
  title: 'title',
  is_active: 'is_active',
  accepts_bookings: 'accepts_bookings',
  service_ids: 'service_ids',
} as const;

/**
 * Edit or add a calendar person (name, job, whether they take bookings, the
 * services they do) in the board's form sheet. Removing someone is asked at
 * screen level: a dialog cannot sit above a native modal on Android.
 */
export function StaffForm({
  staff,
  serviceIds,
  services,
  onClose,
  onRequestDelete,
}: {
  /** null = add a new person */
  staff: StaffRow | null;
  serviceIds: string[];
  services: ServiceRow[];
  onClose: () => void;
  onRequestDelete: (staff: StaffRow) => void;
}) {
  const { t } = useTranslation();
  const form = useForm<StaffValues>({
    resolver: zodResolver(staffSchema(t)),
    defaultValues: {
      name: staff?.name ?? '',
      title: staff?.title ?? '',
      is_active: staff?.is_active ?? true,
      accepts_bookings: staff?.accepts_bookings ?? true,
      service_ids: serviceIds,
    },
  });
  const save = useSaveStaff({
    onSuccess: () => {
      toast.success(t(staff ? 'staff.updated' : 'staff.added'));
      onClose();
    },
    onError: (error) =>
      applyApiFieldErrors(error, API_FIELDS, (field, message) =>
        form.setError(field, { message }),
      ),
  });
  const submit = form.handleSubmit((values) =>
    save.mutate(
      staff
        ? { id: staff.id, body: toStaffFields(values) }
        : { id: null, body: toCreateStaffRequest(values) },
    ),
  );
  const nameError = form.formState.errors.name?.message;

  return (
    <FormSheet
      open
      onClose={onClose}
      title={t(staff ? 'team.form.editTitle' : 'team.form.addTitle')}
      footer={
        <Button
          size="lg"
          // Saving plays its own success haptic.
          haptic={false}
          className="w-full"
          onPress={() => void submit()}
          loading={save.isPending}
          accessibilityLabel={t('common.save')}
        >
          <Text>{t('common.save')}</Text>
        </Button>
      }
    >
      <Group radius={26} className="mx-0">
        <GroupBlock className="min-h-14 flex-row items-center gap-3 px-4">
          <Text className="text-title">{t('staff.name')}</Text>
          <TextRow control={form.control} name="name" label={t('staff.name')} />
        </GroupBlock>
        {nameError ? (
          <Text
            accessibilityRole="alert"
            className="px-4 pb-2 text-subtitle text-destructive"
          >
            {nameError}
          </Text>
        ) : null}
        <GroupBlock
          showSeparator
          className="min-h-14 flex-row items-center gap-3 px-4"
        >
          <Text className="text-title">{t('team.form.job')}</Text>
          <TextRow
            control={form.control}
            name="title"
            label={t('team.form.job')}
          />
        </GroupBlock>
        <ToggleRow
          control={form.control}
          name="is_active"
          label={t('staff.active')}
          hint={t('staff.activeHint')}
        />
        <ToggleRow
          control={form.control}
          name="accepts_bookings"
          label={t('staff.acceptsBookings')}
          hint={t('staff.acceptsBookingsHint')}
        />
      </Group>

      <SectionTitle className="mx-1 mb-2 mt-6">
        {t('staff.services')}
      </SectionTitle>
      <Controller
        control={form.control}
        name="service_ids"
        render={({ field }) => (
          <View className="flex-row flex-wrap gap-2">
            {services.map((service) => {
              const selected = field.value.includes(service.id);
              return (
                <Chip
                  key={service.id}
                  variant="toggle"
                  label={service.name}
                  selected={selected}
                  onPress={() =>
                    field.onChange(
                      selected
                        ? field.value.filter((id) => id !== service.id)
                        : [...field.value, service.id],
                    )
                  }
                />
              );
            })}
          </View>
        )}
      />

      {staff ? (
        <Group radius={26} className="mx-0 mt-6">
          <DestructiveRow
            label={t('staff.delete')}
            onPress={() => onRequestDelete(staff)}
          />
        </Group>
      ) : null}
    </FormSheet>
  );
}

function TextRow({
  control,
  name,
  label,
}: {
  control: Control<StaffValues>;
  name: 'name' | 'title';
  label: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <View className="min-w-0 flex-1">
          <InlineInsetInput
            label={label}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            autoCapitalize="words"
          />
        </View>
      )}
    />
  );
}

function ToggleRow({
  control,
  name,
  label,
  hint,
}: {
  control: Control<StaffValues>;
  name: 'is_active' | 'accepts_bookings';
  label: string;
  hint: string;
}) {
  return (
    <GroupBlock
      showSeparator
      className="min-h-14 flex-row items-center gap-3 px-4 py-2"
    >
      <View className="min-w-0 flex-1">
        <Text className="text-title">{label}</Text>
        <Text className="text-subtitle text-muted-foreground">{hint}</Text>
      </View>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Switch
            checked={field.value}
            onCheckedChange={field.onChange}
            accessibilityLabel={label}
          />
        )}
      />
    </GroupBlock>
  );
}
