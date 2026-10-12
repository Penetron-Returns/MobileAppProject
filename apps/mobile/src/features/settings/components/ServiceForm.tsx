import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2 } from 'lucide-react-native';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormField } from '@/components/FormField';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/Sheet';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import {
  useDeleteService,
  useSaveService,
  type ServiceRow,
} from '@/features/catalog/hooks';
import { centsToInput, formatDuration } from '@/lib/format';
import { applyApiFieldErrors } from '@/lib/form-errors';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

import {
  DURATION_PRESETS,
  serviceSchema,
  toCreateServiceRequest,
  toServiceFields,
  type ServiceValues,
} from '../schemas';

const API_FIELDS = {
  name: 'name',
  category: 'category',
  duration_minutes: 'duration_minutes',
  price_cents: 'price',
  is_active: 'is_active',
} as const;

export function ServiceForm({
  service,
  categories,
  onClose,
}: {
  /** null = create a new service */
  service: ServiceRow | null;
  categories: string[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const form = useForm<ServiceValues>({
    resolver: zodResolver(serviceSchema(t)),
    defaultValues: {
      name: service?.name ?? '',
      category: service?.category ?? '',
      duration_minutes: service?.duration_minutes ?? 60,
      price: service ? centsToInput(service.price_cents) : '',
      is_active: service?.is_active ?? true,
    },
  });
  const save = useSaveService({
    onSuccess: () => {
      toast.success(t(service ? 'services.updated' : 'services.added'));
      onClose();
    },
    onError: (error) =>
      applyApiFieldErrors(error, API_FIELDS, (field, message) =>
        form.setError(field, { message }),
      ),
  });
  const remove = useDeleteService({
    onSuccess: () => {
      toast.success(t('services.removed'));
      onClose();
    },
  });
  const submit = form.handleSubmit((values) =>
    save.mutate(
      service
        ? { id: service.id, body: toServiceFields(values) }
        : { id: null, body: toCreateServiceRequest(values) },
    ),
  );

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            {t(service ? 'services.edit' : 'services.add')}
          </SheetTitle>
        </SheetHeader>
        <ScrollView
          className="max-h-[70vh]"
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-4 pb-2">
            <FormField
              control={form.control}
              name="name"
              label={t('services.name')}
            />
            <FormField
              control={form.control}
              name="category"
              label={t('services.category')}
              hint={
                categories.length
                  ? t('services.categoryHint', { list: categories.join(', ') })
                  : undefined
              }
            />
            <FormField
              control={form.control}
              name="duration_minutes"
              label={t('services.duration')}
              render={({ value, onChange }) => (
                <View className="flex-row flex-wrap gap-2">
                  {DURATION_PRESETS.map((minutes) => (
                    <Chip
                      key={minutes}
                      label={formatDuration(minutes)}
                      selected={value === minutes}
                      onPress={() => onChange(minutes)}
                    />
                  ))}
                </View>
              )}
            />
            <FormField
              control={form.control}
              name="price"
              label={t('services.price')}
              keyboardType="decimal-pad"
              placeholder="0.00"
            />
            <FormField
              control={form.control}
              name="is_active"
              label={t('services.active')}
              render={({ value, onChange }) => (
                <View className="flex-row items-center justify-between">
                  <Text className="text-muted-foreground flex-1 pr-3 text-xs">
                    {t('services.activeHint')}
                  </Text>
                  <Switch
                    checked={value}
                    onCheckedChange={onChange}
                    accessibilityLabel={t('services.active')}
                  />
                </View>
              )}
            />
            {service ? (
              <Pressable
                onPress={() => setConfirmDelete(true)}
                accessibilityRole="button"
                accessibilityLabel={t('services.delete')}
                className="border-destructive/30 bg-destructive/5 min-h-[44px] flex-row items-center justify-center gap-2 rounded-xl border py-2.5 active:bg-destructive/10"
              >
                <Icon as={Trash2} size={16} className="text-destructive" />
                <Text className="text-destructive text-sm font-semibold">
                  {t('services.delete')}
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
          title={t('services.deleteDialog.title')}
          description={t('services.deleteDialog.description')}
          confirmLabel={t('services.deleteDialog.confirm')}
          cancelLabel={t('services.deleteDialog.keep')}
          destructive
          onConfirm={() => {
            setConfirmDelete(false);
            if (service) remove.mutate(service.id);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={cn(
        'min-h-[36px] justify-center rounded-lg border px-3 py-1.5',
        selected
          ? 'bg-primary border-primary'
          : 'bg-muted/40 border-border active:bg-muted',
      )}
    >
      <Text
        className={cn(
          'text-xs font-semibold',
          selected ? 'text-primary-foreground' : 'text-foreground',
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}
