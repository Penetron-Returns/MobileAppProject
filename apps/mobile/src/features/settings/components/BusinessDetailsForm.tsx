import { zodResolver } from '@hookform/resolvers/zod';
import { Check, ChevronDown } from 'lucide-react-native';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { FormField } from '@/components/FormField';
import { Header } from '@/components/Header';
import { OptionSheet } from '@/components/OptionSheet';
import { PersonAvatar } from '@/components/PersonAvatar';
import { Screen } from '@/components/Screen';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Textarea } from '@/components/ui/textarea';
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

const CURRENCIES = ['ZAR', 'USD', 'EUR', 'GBP', 'BWP', 'NAD', 'KES', 'NGN'];
const API_FIELDS = {
  name: 'name',
  email: 'email',
  phone: 'phone',
  address: 'address',
  currency: 'currency',
} as const;

export function BusinessDetailsForm({ initial }: { initial: BusinessDetails }) {
  const { t } = useTranslation();
  const canManage = useCanManage();
  const [currencyOpen, setCurrencyOpen] = React.useState(false);
  const form = useForm<BusinessDetailsValues>({
    resolver: zodResolver(businessDetailsSchema(t)),
    defaultValues: {
      name: initial.name,
      email: initial.email ?? '',
      phone: initial.phone ?? '',
      address: initial.address ?? '',
      currency: initial.currency,
    },
  });
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

  return (
    <Screen
      header={
        <Header title={t('businessDetails.title')} fallbackHref="/settings" />
      }
      footer={
        canManage ? (
          <Pressable
            onPress={save}
            disabled={update.isPending}
            accessibilityRole="button"
            accessibilityLabel={t('common.saveChanges')}
            className="bg-primary h-12 w-full flex-row items-center justify-center gap-2 rounded-xl shadow-md active:opacity-90"
          >
            <Icon as={Check} size={18} className="text-primary-foreground" />
            <Text className="text-primary-foreground text-base font-semibold">
              {update.isPending ? t('common.saving') : t('common.saveChanges')}
            </Text>
          </Pressable>
        ) : undefined
      }
    >
      <View className="mx-auto w-full max-w-2xl gap-5 pb-6">
        <View className="bg-card border-border items-center gap-2 rounded-xl border p-5 shadow-sm">
          <PersonAvatar
            name={initial.name}
            imageUrl={initial.logo_url}
            size="xl"
          />
          <Text className="text-muted-foreground text-xs">
            {t('businessDetails.timezone', { tz: initial.timezone })}
          </Text>
        </View>

        <Section title={t('businessDetails.info')}>
          <FormField
            control={form.control}
            name="name"
            label={t('businessDetails.name')}
            editable={canManage}
          />
          <FormField
            control={form.control}
            name="email"
            label={t('businessDetails.email')}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={canManage}
          />
          <FormField
            control={form.control}
            name="phone"
            label={t('businessDetails.phone')}
            keyboardType="phone-pad"
            editable={canManage}
          />
        </Section>

        <Section title={t('businessDetails.location')}>
          <FormField
            control={form.control}
            name="address"
            label={t('businessDetails.address')}
            render={({ value, onChange, onBlur }) => (
              <Textarea
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                editable={canManage}
              />
            )}
          />
        </Section>

        <Section title={t('businessDetails.regional')}>
          <FormField
            control={form.control}
            name="currency"
            label={t('businessDetails.currency')}
            render={({ value, onChange }) => (
              <>
                <Pressable
                  onPress={() => canManage && setCurrencyOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('businessDetails.currency')}
                  className="border-border bg-muted/30 min-h-[44px] flex-row items-center justify-between rounded-xl border px-3.5 py-2.5"
                >
                  <Text className="text-foreground text-sm font-medium">
                    {currencyLabel(value)}
                  </Text>
                  <Icon
                    as={ChevronDown}
                    size={18}
                    className="text-muted-foreground"
                  />
                </Pressable>
                <OptionSheet
                  open={currencyOpen}
                  onOpenChange={setCurrencyOpen}
                  title={t('businessDetails.currency')}
                  selected={value}
                  options={CURRENCIES.map((code) => ({
                    value: code,
                    label: currencyLabel(code),
                  }))}
                  onSelect={onChange}
                />
              </>
            )}
          />
        </Section>
      </View>
    </Screen>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="bg-card border-border gap-4 rounded-xl border p-5 shadow-sm">
      <Text className="text-foreground border-border border-b pb-2.5 text-base font-bold">
        {title}
      </Text>
      <View className="gap-3.5">{children}</View>
    </View>
  );
}
