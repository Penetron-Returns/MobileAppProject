import type { CompanionSetupDTO, WhatsAppChannelDTO } from '@booking/types';
import type { TFunction } from 'i18next';
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

import { formatPhone } from '@/lib/format';

import { formatMinutes } from './format';
import { useBookingRules } from './hooks';
import type { SettingsItem } from './navigation';
import { openDaysSummary } from './summaries';
import { useWhatsAppChannel } from './useWhatsAppChannel';
import { channelPill } from './whatsappChannel';
import { goLiveSteps } from './whatsappStatus';

/** What a Settings row shows beside its title; `disabled` rows stay visible and say why. */
export interface RowModel {
  detail?: string;
  tone?: 'secondary' | 'success';
  disabled?: boolean;
  reason?: string;
}

/** The WhatsApp row: the number when connected, else how many steps are left. */
function whatsappRow(setup: CompanionSetupDTO, t: TFunction): RowModel {
  const steps = goLiveSteps(setup).length;
  if (setup.whatsapp.connected) {
    const phone = formatPhone(setup.whatsapp.display_phone_number);
    return {
      detail: phone
        ? t('settings.whatsapp.rowConnected', { phone })
        : t('settings.whatsapp.pill.connected'),
      tone: 'success',
    };
  }
  if (steps > 1 || setup.whatsapp.state !== 'not_connected') {
    return {
      detail:
        setup.whatsapp.state === 'not_connected'
          ? t('settings.whatsapp.rowSteps', { count: steps })
          : t('settings.whatsapp.pill.pending'),
      tone: 'secondary',
    };
  }
  return {
    detail: t('settings.whatsapp.pill.not_connected'),
    tone: 'secondary',
  };
}

/** The WhatsApp row on Free: the number when live, else the channel state. */
function channelRow(channel: WhatsAppChannelDTO, t: TFunction): RowModel {
  const pill = channelPill(channel);
  const phone = formatPhone(channel.display_phone);
  if (pill === 'live' && phone) {
    return {
      detail: t('settings.whatsapp.rowConnected', { phone }),
      tone: 'success',
    };
  }
  return {
    detail: t(`settings.whatsapp.channel.pill.${pill}`),
    tone: pill === 'live' ? 'success' : 'secondary',
  };
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
  const { hasClovie } = entitlements;
  const setup = useCompanionSetup({ enabled: isOwner && hasClovie });
  const channel = useWhatsAppChannel({ enabled: !hasClovie });

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

    let whatsapp: RowModel = none;
    if (!hasClovie && channel.data) whatsapp = channelRow(channel.data, t);
    if (hasClovie && setup.data) whatsapp = whatsappRow(setup.data, t);

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
      haptics: none,
      deleteAccount: none,
    };
  }, [
    t,
    setup.data,
    channel.data,
    hasClovie,
    entitlements,
    details.data,
    hours.data,
    services.data,
    staff.data,
    rules.data,
  ]);
}
