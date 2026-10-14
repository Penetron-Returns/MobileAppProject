import {
  ErrorState,
  Group,
  GroupRow,
  ListSkeleton,
  OptionSheet,
  Page,
  Switch,
  Text,
} from '@booking/ui';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { describeError } from '@/lib/toast';
import { useCanManage } from '@/features/business/me';

import { useBookingRules, useSaveBookingRules, type RulePatch } from '../hooks';
import {
  minutesToParts,
  REMINDER_OPTIONS,
  RULE_OPTIONS,
  sameOffsets,
} from '../rules';

type Translate = ReturnType<typeof useTranslation>['t'];

export function formatMinutes(t: Translate, minutes: number): string {
  const p = minutesToParts(minutes);
  return t(`settings.units.${p.unit}`, { count: p.count });
}

function formatDays(t: Translate, days: number): string {
  return t('settings.units.days', { count: days });
}

function formatReminders(t: Translate, offsets: number[]): string {
  if (offsets.length === 0) return t('settings.rules.noReminders');
  return offsets
    .map((m) => formatMinutes(t, m))
    .join(` ${t('settings.rules.and')} `);
}

type NumericKey = keyof typeof RULE_OPTIONS;
type Picker =
  { kind: 'number'; key: NumericKey; days?: boolean } | { kind: 'reminders' };

/** Booking rules as plain sentences; tap a value to change it. */
export function BookingRulesScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const canManage = useCanManage();
  const rules = useBookingRules();
  const save = useSaveBookingRules();
  const [picker, setPicker] = React.useState<Picker | null>(null);

  const patch = (body: RulePatch) => save.mutate({ booking_rules: body });

  let body: React.ReactNode;
  if (!canManage) {
    body = (
      <Text className="mx-5 mt-5 text-title text-muted-foreground">
        {t('settings.ownerOnly')}
      </Text>
    );
  } else if (rules.isError) {
    body = (
      <ErrorState
        variant="banner"
        {...describeError(rules.error)}
        onRetry={() => void rules.refetch()}
      />
    );
  } else if (rules.isPending) {
    body = <ListSkeleton rows={4} />;
  } else {
    const r = rules.data;
    const numeric = (key: NumericKey, days = false) => ({
      title: t(`settings.rules.${key}`),
      value: days ? formatDays(t, r[key]) : formatMinutes(t, r[key]),
      open: () => setPicker({ kind: 'number', key, days }),
    });
    const rows = [
      numeric('lead_time_minutes'),
      numeric('booking_horizon_days', true),
      numeric('cancellation_window_minutes'),
      {
        title: t('settings.rules.reminders'),
        value: formatReminders(t, r.reminder_offsets_minutes),
        open: () => setPicker({ kind: 'reminders' }),
      },
      numeric('slot_interval_minutes'),
      numeric('buffer_minutes'),
    ];
    body = (
      <>
        <Text className="mx-5 mt-2 text-title text-muted-foreground">
          {t('settings.rules.hint')}
        </Text>
        <Group className="mt-5">
          {rows.map((row, i) => (
            <GroupRow
              key={row.title}
              showSeparator={i > 0}
              title={row.title}
              detail={row.value}
              onPress={row.open}
              accessibilityLabel={t('settings.rules.change', {
                rule: row.title,
                value: row.value,
              })}
            />
          ))}
          <GroupRow
            showSeparator
            title={t('settings.rules.allow_staff_selection')}
            trailing={
              <Switch
                checked={r.allow_staff_selection}
                disabled={save.isPending}
                onCheckedChange={(v) => patch({ allow_staff_selection: v })}
                accessibilityLabel={t('settings.rules.allow_staff_selection')}
              />
            }
          />
        </Group>
        <Text className="mx-5 mt-3 text-meta text-muted-foreground">
          {t('settings.rules.footer')}
        </Text>
        <RulePicker
          picker={picker}
          rules={r}
          onClose={() => setPicker(null)}
          onPatch={patch}
        />
      </>
    );
  }

  return (
    <Page
      title={t('settings.items.rules')}
      backLabel={t('tabs.settings')}
      backFallback="/settings"
      onRefresh={() => queryClient.refetchQueries({ type: 'active' })}
    >
      {body}
    </Page>
  );
}

function RulePicker({
  picker,
  rules,
  onClose,
  onPatch,
}: {
  picker: Picker | null;
  rules: NonNullable<ReturnType<typeof useBookingRules>['data']>;
  onClose: () => void;
  onPatch: (p: RulePatch) => void;
}) {
  const { t } = useTranslation();
  if (!picker) return null;
  if (picker.kind === 'reminders') {
    const options = REMINDER_OPTIONS.map((offsets, i) => ({
      value: String(i),
      label: formatReminders(t, offsets),
    }));
    const selected = REMINDER_OPTIONS.findIndex((o) =>
      sameOffsets(o, rules.reminder_offsets_minutes),
    );
    return (
      <OptionSheet
        open
        onOpenChange={(open) => !open && onClose()}
        title={t('settings.rules.reminders')}
        options={options}
        selected={selected >= 0 ? String(selected) : null}
        onSelect={(v) =>
          onPatch({ reminder_offsets_minutes: REMINDER_OPTIONS[Number(v)] })
        }
      />
    );
  }
  const current = rules[picker.key];
  const values = RULE_OPTIONS[picker.key];
  const options = (values.includes(current) ? values : [...values, current])
    .sort((a, b) => a - b)
    .map((v) => ({
      value: String(v),
      label: picker.days ? formatDays(t, v) : formatMinutes(t, v),
    }));
  return (
    <OptionSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={t(`settings.rules.${picker.key}`)}
      options={options}
      selected={String(current)}
      onSelect={(v) => onPatch({ [picker.key]: Number(v) })}
    />
  );
}
