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

import { isFailed, loadError } from '@/lib/offline';
import { describeError } from '@/lib/toast';
import { useCanManage } from '@/features/business/me';

import { ExplainerStage } from '../explainers/ExplainerStage';
import { shortDays, shortMinutes } from '../explainers/labels';
import type { SceneId } from '../explainers/scenes';
import { formatDays, formatMinutes } from '../format';
import { useBookingRules, useSaveBookingRules, type RulePatch } from '../hooks';
import { RULE_OPTIONS } from '../rules';
import { OwnerOnlyNote } from './OwnerOnlyNote';

type NumericKey = keyof typeof RULE_OPTIONS;

/** The thumbnail of each rule row, and the short label drawn in it. */
const SCENE: Record<NumericKey, SceneId> = {
  lead_time_minutes: 'lead',
  booking_horizon_days: 'horizon',
  cancellation_window_minutes: 'cancel',
  slot_interval_minutes: 'interval',
  buffer_minutes: 'buffer',
};
interface Picker {
  key: NumericKey;
  days: boolean;
}

/**
 * Booking rules as plain sentences; tap a value to change it. Staff see the
 * same rows read-only. Client reminders live under WhatsApp, where they are sent.
 */
export function BookingRulesScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const canManage = useCanManage();
  const rules = useBookingRules();
  const save = useSaveBookingRules();
  const [picker, setPicker] = React.useState<Picker | null>(null);

  const patch = (body: RulePatch) => save.mutate({ booking_rules: body });

  let body: React.ReactNode;
  if (isFailed(rules)) {
    body = (
      <ErrorState
        variant="banner"
        {...describeError(loadError(rules))}
        onRetry={() => void rules.refetch()}
      />
    );
  } else if (rules.isPending) {
    body = <ListSkeleton rows={4} />;
  } else {
    const r = rules.data;
    const numeric = (key: NumericKey, days = false) => ({
      key,
      title: t(`settings.rules.${key}`),
      value: days ? formatDays(t, r[key]) : formatMinutes(t, r[key]),
      open: () => setPicker({ key, days }),
    });
    const rows = [
      numeric('lead_time_minutes'),
      numeric('booking_horizon_days', true),
      numeric('cancellation_window_minutes'),
      numeric('slot_interval_minutes'),
      numeric('buffer_minutes'),
    ];
    body = (
      <>
        {canManage ? (
          <Text className="mx-5 mt-2 text-title text-muted-foreground">
            {t('settings.rules.hint')}
          </Text>
        ) : null}
        <Group className="mt-5">
          {rows.map((row, i) => (
            <GroupRow
              key={row.title}
              showSeparator={i > 0}
              title={row.title}
              subtitle={t(`settings.explainers.help.${row.key}`)}
              visual={
                <ExplainerStage
                  scene={SCENE[row.key]}
                  index={i}
                  label={
                    row.key === 'booking_horizon_days'
                      ? shortDays(t, r[row.key])
                      : shortMinutes(t, r[row.key])
                  }
                  stepMinutes={r.slot_interval_minutes}
                />
              }
              detail={row.value}
              onPress={canManage ? row.open : undefined}
              accessibilityLabel={
                canManage
                  ? t('settings.rules.change', {
                      rule: row.title,
                      value: row.value,
                    })
                  : `${row.title}, ${row.value}`
              }
            />
          ))}
          <GroupRow
            showSeparator
            title={t('settings.rules.allow_staff_selection')}
            subtitle={t('settings.explainers.help.allow_staff_selection')}
            visual={<ExplainerStage scene="staff" index={rows.length} />}
            trailing={
              <Switch
                checked={r.allow_staff_selection}
                disabled={!canManage}
                onCheckedChange={(v) => patch({ allow_staff_selection: v })}
                accessibilityLabel={t('settings.rules.allow_staff_selection')}
              />
            }
          />
        </Group>
        <Text className="mx-5 mt-3 text-meta text-muted-foreground">
          {t('settings.rules.footer')}
        </Text>
        <OwnerOnlyNote />
        {picker ? (
          <RulePicker
            picker={picker}
            current={r[picker.key]}
            onClose={() => setPicker(null)}
            onPatch={patch}
          />
        ) : null}
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
  current,
  onClose,
  onPatch,
}: {
  picker: Picker;
  current: number;
  onClose: () => void;
  onPatch: (p: RulePatch) => void;
}) {
  const { t } = useTranslation();
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
