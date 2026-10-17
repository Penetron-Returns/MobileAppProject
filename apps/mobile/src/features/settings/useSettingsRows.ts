import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  useBusinessDetails,
  useBusinessHours,
} from '@/features/business/hooks';
import { useMe } from '@/features/business/me';
import { useServices, useStaff } from '@/features/catalog/hooks';
import { useCompanionSetup } from '@/features/companion/hooks';
import { useEntitlements } from '@/features/plans/hooks';

import { formatMinutes } from './format';
import { useBookingRules } from './hooks';
import type { SettingsItem } from './navigation';
import { openDaysSummary } from './summaries';

/** What a Settings row shows beside its title; `disabled` rows stay visible and say why. */
export interface RowModel {
  detail?: string;
  tone?: 'secondary' | 'success';
  disabled?: boolean;
  reason?: string;
}

/**
 * The value, state and reason of every Settings row. Rows are never dropped:
 * what a role, plan or platform cannot use is `disabled` with a reason, and a
 * value that is still loading (or owner-only) is simply left off.
 */
export function useSettingsRows(): Record<SettingsItem, RowModel> {
  const { t } = useTranslation();
  const me = useMe();
  const isOwner = me.data?.role !== 'staff';
  const entitlements = useEntitlements();
  const details = useBusinessDetails();
  const hours = useBusinessHours();
  const services = useServices();
  const staff = useStaff();
  const rules = useBookingRules();
  const setup = useCompanionSetup({ enabled: isOwner });

  return React.useMemo(() => {
    const none: RowModel = {};
    const days = hours.data ? openDaysSummary(hours.data) : undefined;

    const clovie: RowModel = setup.data
      ? {
          detail: t(
            setup.data.companion_live
              ? 'settings.clovie.live'
              : 'settings.clovie.paused',
          ),
          tone: setup.data.companion_live ? 'success' : 'secondary',
        }
      : none;

    const whatsapp: RowModel = setup.data
      ? {
          detail: t(
            setup.data.whatsapp.connected
              ? 'settings.whatsapp.rowStatus.live'
              : 'settings.whatsapp.rowStatus.none',
          ),
          tone: setup.data.whatsapp.connected ? 'success' : 'secondary',
        }
      : none;

    return {
      businessDetails: { detail: details.data?.name },
      hours: {
        detail: hours.data ? (days ?? t('settings.hoursClosed')) : undefined,
      },
      services: {
        detail: services.data ? String(services.data.length) : undefined,
      },
      rules: {
        detail: rules.data
          ? t('settings.rulesValue', {
              lead: formatMinutes(t, rules.data.lead_time_minutes),
            })
          : undefined,
      },
      team: { detail: staff.data ? String(staff.data.length) : undefined },
      clovie,
      whatsapp,
      notifications: none,
      plan: {
        detail: entitlements.plan
          ? t(`plans.names.${entitlements.plan}`)
          : undefined,
      },
      appearance: none,
      deleteAccount: none,
    };
  }, [
    t,
    setup.data,
    entitlements,
    details.data,
    hours.data,
    services.data,
    staff.data,
    rules.data,
  ]);
}
