import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  useBusinessDetails,
  useBusinessHours,
  useWhatsAppAccount,
} from '@/features/business/hooks';
import { useMe } from '@/features/business/me';
import { useServices, useStaff } from '@/features/catalog/hooks';
import { useCompanionSetup } from '@/features/companion/hooks';
import { useAppMode, useEntitlements } from '@/features/plans/hooks';

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
  const mode = useAppMode();
  const entitlements = useEntitlements();
  const details = useBusinessDetails();
  const hours = useBusinessHours();
  const services = useServices();
  const staff = useStaff();
  const rules = useBookingRules();
  const legacyWhatsApp = useWhatsAppAccount();
  const isPaid = mode === 'ai';
  const setup = useCompanionSetup({ enabled: isOwner && isPaid });

  return React.useMemo(() => {
    const none: RowModel = {};
    const days = hours.data ? openDaysSummary(hours.data) : undefined;

    const clovie: RowModel = isPaid
      ? setup.data
        ? {
            detail: t(
              setup.data.companion_live
                ? 'settings.clovie.live'
                : 'settings.clovie.paused',
            ),
            tone: setup.data.companion_live ? 'success' : 'secondary',
          }
        : none
      : { disabled: true, reason: t('settings.clovie.paidOnly') };

    let whatsapp: RowModel = none;
    if (isPaid) {
      if (setup.data) {
        const connected = setup.data.whatsapp.connected;
        whatsapp = {
          detail: t(
            connected
              ? 'settings.whatsapp.rowStatus.live'
              : 'settings.whatsapp.rowStatus.none',
          ),
          tone: connected ? 'success' : 'secondary',
        };
      }
    } else if (!entitlements.isLoading && !entitlements.has('whatsapp_menu')) {
      whatsapp = { disabled: true, reason: t('settings.whatsapp.notInPlan') };
    } else if (legacyWhatsApp.data !== undefined) {
      const status = legacyWhatsApp.data?.status ?? 'none';
      whatsapp = {
        detail: t(`settings.whatsapp.rowStatus.${status}`),
        tone: status === 'live' ? 'success' : 'secondary',
      };
    }

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
    isPaid,
    setup.data,
    entitlements,
    legacyWhatsApp.data,
    details.data,
    hours.data,
    services.data,
    staff.data,
    rules.data,
  ]);
}
