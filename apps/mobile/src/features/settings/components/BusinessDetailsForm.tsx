import {
  Avatar,
  Group,
  GroupField,
  GroupRow,
  OptionSheet,
  Page,
  SaveFooter,
  SectionTitle,
} from '@booking/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import {
  useUpdateBusiness,
  type BusinessDetails,
} from '@/features/business/hooks';
import { useCanManage } from '@/features/business/me';
import { applyApiFieldErrors } from '@/lib/form-errors';
import { toast } from '@/lib/toast';

import {
  businessDetailsSchema,
  toUpdateBusinessRequest,
  type BusinessDetailsValues,
} from '../schemas';
import { OwnerOnlyNote } from './OwnerOnlyNote';

const CURRENCIES = ['ZAR', 'USD', 'EUR', 'GBP', 'BWP', 'NAD', 'KES', 'NGN'];
const API_FIELDS = {
  name: 'name',
  email: 'email',
  phone: 'phone',
  address: 'address',
  currency: 'currency',
} as const;

function toValues(d: BusinessDetails | undefined): BusinessDetailsValues {
  return {
    name: d?.name ?? '',
    email: d?.email ?? '',
    phone: d?.phone ?? '',
    address: d?.address ?? '',
    currency: d?.currency ?? 'ZAR',
  };
}

/**
 * The Business details page. It is one page throughout: while `initial` is
 * still loading `fallback` (skeleton or error) fills the body, and the fields
 * are seeded once when the details arrive (a later refetch never overwrites
 * what the owner is typing).
 */
export function BusinessDetailsForm({
  initial,
  fallback,
}: {
  initial: BusinessDetails | undefined;
  fallback: React.ReactNode;
}) {
  const { t } = useTranslation();
  const canManage = useCanManage();
  const [currencyOpen, setCurrencyOpen] = React.useState(false);
  const form = useForm<BusinessDetailsValues>({
    resolver: zodResolver(businessDetailsSchema(t)),
    defaultValues: toValues(initial),
  });
  const isSeeded = React.useRef(initial !== undefined);
  React.useEffect(() => {
    if (initial && !isSeeded.current) {
      isSeeded.current = true;
      form.reset(toValues(initial));
    }
  }, [initial, form]);
  const update = useUpdateBusiness({
    onSuccess: () => toast.success(t('businessDetails.saved')),
    onError: (error) =>
      applyApiFieldErrors(error, API_FIELDS, (field, message) =>
        form.setError(field, { message }),
      ),
  });
  const save = form.handleSubmit((values) =>
    update.mutate(toUpdateBusinessRequest(values)),
  );
  const currencyLabel = (code: string) =>
    t(`businessDetails.currencies.${code}`, { defaultValue: code });
  const currency = form.watch('currency');

  return (
    <Page
      title={t('businessDetails.title')}
      backLabel={t('tabs.settings')}
      backFallback="/settings"
      footer={
        canManage && initial ? (
          <SaveFooter
            label={
              update.isPending ? t('common.saving') : t('common.saveChanges')
            }
            onPress={() => void save()}
            disabled={update.isPending}
          />
        ) : undefined
      }
    >
      {initial ? (
        <>
          <View className="items-center gap-2 pt-4">
            <Avatar name={initial.name} imageUrl={initial.logo_url} size="xl" />
          </View>

          <SectionTitle>{t('settings.details.contact')}</SectionTitle>
          <Group>
            <GroupField
              control={form.control}
              name="name"
              label={t('businessDetails.name')}
              editable={canManage}
            />
            <GroupField
              showSeparator
              control={form.control}
              name="email"
              label={t('businessDetails.email')}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={canManage}
            />
            <GroupField
              showSeparator
              control={form.control}
              name="phone"
              label={t('businessDetails.phone')}
              keyboardType="phone-pad"
              editable={canManage}
            />
          </Group>

          <SectionTitle>{t('settings.details.address')}</SectionTitle>
          <Group>
            <GroupField
              control={form.control}
              name="address"
              label={t('businessDetails.address')}
              multiline
              editable={canManage}
            />
          </Group>

          <SectionTitle>{t('settings.details.regional')}</SectionTitle>
          <Group>
            <GroupRow
              title={t('businessDetails.currency')}
              detail={currencyLabel(currency)}
              onPress={canManage ? () => setCurrencyOpen(true) : undefined}
              accessibilityLabel={t('settings.details.currencyChange', {
                value: currencyLabel(currency),
              })}
            />
            <GroupRow
              showSeparator
              title={t('settings.details.timezone')}
              detail={initial.timezone}
              subtitle={t('settings.details.timezoneFixed')}
            />
          </Group>
          <OwnerOnlyNote />
          <OptionSheet
            open={currencyOpen}
            onOpenChange={setCurrencyOpen}
            title={t('businessDetails.currency')}
            selected={currency}
            options={CURRENCIES.map((code) => ({
              value: code,
              label: currencyLabel(code),
            }))}
            onSelect={(code) =>
              form.setValue('currency', code, { shouldDirty: true })
            }
          />
        </>
      ) : (
        fallback
      )}
    </Page>
  );
}
