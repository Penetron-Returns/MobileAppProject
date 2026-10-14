import {
  Button,
  Chip,
  ConfirmDialog,
  FormField,
  Icon,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Switch,
  Text,
} from '@booking/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2 } from 'lucide-react-native';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import {
  useDeleteStaff,
  useSaveStaff,
  type ServiceRow,
  type StaffRow,
} from '@/features/catalog/hooks';
import { applyApiFieldErrors } from '@/lib/form-errors';
import { toast } from '@/lib/toast';

import {
  staffSchema,
  toCreateStaffRequest,
  toStaffFields,
  type StaffValues,
} from '../schemas';

const API_FIELDS = {
  name: 'name',
  title: 'title',
  is_active: 'is_active',
  accepts_bookings: 'accepts_bookings',
  service_ids: 'service_ids',
} as const;

export function StaffForm({
  staff,
  serviceIds,
  services,
  onClose,
}: {
  /** null = add a new staff member */
  staff: StaffRow | null;
  serviceIds: string[];
  services: ServiceRow[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
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
  const remove = useDeleteStaff({
    onSuccess: () => {
      toast.success(t('staff.removed'));
      onClose();
    },
  });
  const submit = form.handleSubmit((values) =>
    save.mutate(
      staff
        ? { id: staff.id, body: toStaffFields(values) }
        : { id: null, body: toCreateStaffRequest(values) },
    ),
  );

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t(staff ? 'staff.edit' : 'staff.add')}</SheetTitle>
        </SheetHeader>
        <ScrollView
          className="max-h-[70vh]"
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-4 pb-2">
            <FormField
              control={form.control}
              name="name"
              label={t('staff.name')}
            />
            <FormField
              control={form.control}
              name="title"
              label={t('staff.title')}
            />
            <ToggleField
              form={form}
              name="is_active"
              label={t('staff.active')}
              hint={t('staff.activeHint')}
            />
            <ToggleField
              form={form}
              name="accepts_bookings"
              label={t('staff.acceptsBookings')}
              hint={t('staff.acceptsBookingsHint')}
            />
            <FormField
              control={form.control}
              name="service_ids"
              label={t('staff.services')}
              render={({ value, onChange }) => (
                <View className="flex-row flex-wrap gap-2">
                  {services.map((s) => {
                    const selected = value.includes(s.id);
                    return (
                      <Chip
                        variant="filter"
                        key={s.id}
                        label={s.name}
                        selected={selected}
                        onPress={() =>
                          onChange(
                            selected
                              ? value.filter((id) => id !== s.id)
                              : [...value, s.id],
                          )
                        }
                      />
                    );
                  })}
                </View>
              )}
            />
            {staff ? (
              <Pressable
                onPress={() => setConfirmDelete(true)}
                accessibilityRole="button"
                accessibilityLabel={t('staff.delete')}
                className="border-destructive/30 bg-destructive/5 min-h-[44px] flex-row items-center justify-center gap-2 rounded-xl border py-2.5 active:bg-destructive/10"
              >
                <Icon as={Trash2} size={16} className="text-destructive" />
                <Text className="text-destructive text-sm font-semibold">
                  {t('staff.delete')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
        <View className="flex-row gap-2.5">
          <Button variant="outline" className="flex-1" onPress={onClose}>
            <Text>{t('common.cancel')}</Text>
          </Button>
          <Button className="flex-1" onPress={submit} disabled={save.isPending}>
            <Text>
              {save.isPending ? t('common.saving') : t('common.save')}
            </Text>
          </Button>
        </View>
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={t('staff.deleteDialog.title')}
          description={t('staff.deleteDialog.description')}
          confirmLabel={t('staff.deleteDialog.confirm')}
          cancelLabel={t('staff.deleteDialog.keep')}
          destructive
          onConfirm={() => {
            setConfirmDelete(false);
            if (staff) remove.mutate(staff.id);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

function ToggleField({
  form,
  name,
  label,
  hint,
}: {
  form: ReturnType<typeof useForm<StaffValues>>;
  name: 'is_active' | 'accepts_bookings';
  label: string;
  hint: string;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      label={label}
      render={({ value, onChange }) => (
        <View className="flex-row items-center justify-between">
          <Text className="text-muted-foreground flex-1 pr-3 text-xs">
            {hint}
          </Text>
          <Switch
            checked={value}
            onCheckedChange={onChange}
            accessibilityLabel={label}
          />
        </View>
      )}
    />
  );
}
