import {
  Chip,
  Disclosure,
  Group,
  GroupBlock,
  InlineInsetInput,
  Pressable,
  SectionTitle,
  SegmentedControl,
  Stepper,
  Switch,
  Text,
  useDepth,
  resolveSystemColor,
} from '@booking/ui';
import * as React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { StaffRow } from '@/features/catalog/hooks';
import { currencySymbol } from '@/lib/format';

import {
  SERVICE_DURATION_MAX,
  SERVICE_DURATION_MIN,
  SERVICE_DURATION_STEP,
  durationLabel,
  firstName,
  stepValue,
} from '../lists';
import type { ServiceValues } from '../schemas';

/** Most categories the segmented control can hold before it becomes chips. */
const MAX_SEGMENTS = 4;

interface ServiceFormBodyProps {
  form: UseFormReturn<ServiceValues>;
  currency: string;
  categories: string[];
  /** Null while the team is still loading: the section is hidden. */
  staff: StaffRow[] | null;
  canDelete: boolean;
  onDelete: () => void;
}

/** The fields of the Edit service sheet, in the board's order. */
export function ServiceFormBody({
  form,
  currency,
  categories,
  staff,
  canDelete,
  onDelete,
}: ServiceFormBodyProps) {
  const { t } = useTranslation();
  const depth = useDepth();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const values = form.watch();
  const set = <K extends keyof ServiceValues>(
    key: K,
    value: ServiceValues[K],
  ) =>
    form.setValue(key, value as never, {
      shouldDirty: true,
      shouldValidate: true,
    });
  const errors = form.formState.errors;
  const staffIds = values.staff_ids ?? [];

  return (
    <>
      <Group radius={26} className="mx-0">
        <View className="min-h-14 flex-row items-center gap-3 px-4">
          <Text className="text-title">{t('services.name')}</Text>
          <InlineInsetInput
            label={t('services.name')}
            value={values.name}
            onChangeText={(v) => set('name', v)}
            containerClassName="flex-1"
          />
        </View>
        <GroupBlock showSeparator>
          <View className="min-h-14 flex-row items-center gap-3 px-4">
            <Text className="flex-1 text-title">{t('services.duration')}</Text>
            <Stepper
              valueText={durationLabel(values.duration_minutes, t)}
              decrementLabel={t('services.shorter')}
              incrementLabel={t('services.longer')}
              disableDecrement={values.duration_minutes <= SERVICE_DURATION_MIN}
              disableIncrement={values.duration_minutes >= SERVICE_DURATION_MAX}
              onDecrement={() =>
                set(
                  'duration_minutes',
                  stepValue(
                    values.duration_minutes,
                    -1,
                    SERVICE_DURATION_STEP,
                    SERVICE_DURATION_MIN,
                    SERVICE_DURATION_MAX,
                  ),
                )
              }
              onIncrement={() =>
                set(
                  'duration_minutes',
                  stepValue(
                    values.duration_minutes,
                    1,
                    SERVICE_DURATION_STEP,
                    SERVICE_DURATION_MIN,
                    SERVICE_DURATION_MAX,
                  ),
                )
              }
            />
          </View>
        </GroupBlock>
        <GroupBlock showSeparator>
          <View className="min-h-14 flex-row items-center gap-2 px-4">
            <Text className="flex-1 text-title">{t('services.price')}</Text>
            <Text
              importantForAccessibility="no"
              className="text-title text-muted-foreground"
            >
              {currencySymbol(currency)}
            </Text>
            <InlineInsetInput
              label={t('services.price')}
              value={values.price}
              onChangeText={(v) => set('price', v)}
              keyboardType="decimal-pad"
              placeholder="0.00"
              containerClassName="w-[88px]"
            />
          </View>
        </GroupBlock>
      </Group>
      {errors.name || errors.price ? (
        <Text
          accessibilityRole="alert"
          style={{ color: depth.colors.destructiveText }}
          className="mx-1 mt-2 text-subtitle"
        >
          {errors.name?.message ?? errors.price?.message}
        </Text>
      ) : null}

      {staff ? (
        <>
          <SectionTitle className="mx-1 mb-2 mt-6">
            {t('services.whoDoes')}
          </SectionTitle>
          <View className="flex-row flex-wrap gap-2">
            {staff.map((member) => {
              const on = staffIds.includes(member.id);
              return (
                <Chip
                  key={member.id}
                  variant="toggle"
                  label={firstName(member.name)}
                  accessibilityLabel={member.name}
                  selected={on}
                  dotColor={resolveSystemColor(member.color, depth.scheme)}
                  onPress={() =>
                    set(
                      'staff_ids',
                      on
                        ? staffIds.filter((id) => id !== member.id)
                        : [...staffIds, member.id],
                    )
                  }
                />
              );
            })}
          </View>
        </>
      ) : null}

      <Disclosure
        label={t('services.moreOptions')}
        expanded={moreOpen}
        onPress={() => setMoreOpen((open) => !open)}
        className="mt-3"
      />
      {moreOpen ? (
        <Group radius={26} className="mx-0">
          <View className="px-4 py-3.5">
            <Text className="mb-2 text-subtitle text-muted-foreground">
              {t('services.category')}
            </Text>
            {categories.length > 0 && categories.length <= MAX_SEGMENTS ? (
              <SegmentedControl
                variant="choice"
                label={t('services.category')}
                value={values.category.trim()}
                options={categories.map((c) => ({ value: c, label: c }))}
                onChange={(c) => set('category', c)}
              />
            ) : (
              <View className="flex-row flex-wrap gap-2">
                {categories.map((c) => (
                  <Chip
                    key={c}
                    variant="choice"
                    label={c}
                    selected={values.category.trim() === c}
                    onPress={() => set('category', c)}
                  />
                ))}
              </View>
            )}
            <InlineInsetInput
              label={t('services.newCategory')}
              placeholder={t('services.newCategory')}
              value={values.category}
              onChangeText={(v) => set('category', v)}
              containerClassName="mt-2"
            />
          </View>
          <GroupBlock showSeparator>
            <View className="min-h-14 flex-row items-center gap-3 px-4 py-2">
              <Text className="flex-1 text-title">{t('services.active')}</Text>
              <Switch
                checked={values.is_active}
                onCheckedChange={(v) => set('is_active', v)}
                accessibilityLabel={t('services.active')}
              />
            </View>
          </GroupBlock>
          {canDelete ? (
            <GroupBlock showSeparator>
              <Pressable
                onPress={onDelete}
                accessibilityRole="button"
                accessibilityLabel={t('services.delete')}
                className="min-h-14 items-center justify-center px-4 py-2"
              >
                <Text
                  style={{ color: depth.colors.destructiveText }}
                  className="text-title leading-7"
                >
                  {t('services.delete')}
                </Text>
              </Pressable>
            </GroupBlock>
          ) : null}
        </Group>
      ) : null}
    </>
  );
}
