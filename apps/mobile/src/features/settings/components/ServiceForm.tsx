import { Button, FormSheet, Text } from '@booking/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import {
  useSaveService,
  type ServiceRow,
  type StaffRow,
} from '@/features/catalog/hooks';
import { centsToInput } from '@/lib/format';
import { applyApiFieldErrors } from '@/lib/form-errors';
import { toast } from '@/lib/toast';

import {
  serviceSchema,
  toCreateServiceRequest,
  toServiceFields,
  type ServiceValues,
} from '../schemas';
import { ServiceFormBody } from './ServiceFormBody';

const API_FIELDS = {
  name: 'name',
  category: 'category',
  duration_minutes: 'duration_minutes',
  price_cents: 'price',
  is_active: 'is_active',
  staff_ids: 'staff_ids',
} as const;

/** The Edit / New service sheet: fields, pinned Save, delete behind a confirm. */
export function ServiceForm({
  service,
  categories,
  currency,
  staff,
  staffIds,
  onClose,
  onDelete,
}: {
  /** null = create a new service */
  service: ServiceRow | null;
  categories: string[];
  currency: string;
  /** Bookable people for "Who does it"; null while the team loads. */
  staff: StaffRow[] | null;
  /** The people who do this service now (empty for a new one). */
  staffIds: string[];
  onClose: () => void;
  /** Asks the screen to confirm and delete (dialogs cannot sit inside the sheet's modal). */
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const form = useForm<ServiceValues>({
    resolver: zodResolver(serviceSchema(t)),
    defaultValues: {
      name: service?.name ?? '',
      category: service?.category ?? '',
      duration_minutes: service?.duration_minutes ?? 30,
      price: service ? centsToInput(service.price_cents) : '',
      is_active: service?.is_active ?? true,
      // Without the team loaded the links are left alone (omitted from the request).
      staff_ids: staff ? staffIds : undefined,
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
  const submit = form.handleSubmit((values) =>
    save.mutate(
      service
        ? { id: service.id, body: toServiceFields(values) }
        : { id: null, body: toCreateServiceRequest(values) },
    ),
  );

  return (
    <FormSheet
      open
      onClose={onClose}
      title={t(service ? 'services.edit' : 'services.add')}
      footer={
        <Button
          size="lg"
          onPress={submit}
          loading={save.isPending}
          accessibilityLabel={t('common.save')}
        >
          <Text>{save.isPending ? t('common.saving') : t('common.save')}</Text>
        </Button>
      }
    >
      <ServiceFormBody
        form={form}
        currency={currency}
        categories={categories}
        staff={staff}
        canDelete={service !== null}
        onDelete={onDelete}
      />
    </FormSheet>
  );
}
