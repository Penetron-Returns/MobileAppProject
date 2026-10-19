import type { WhatsAppChannelDTO } from '@booking/types';
import type { TFunction } from 'i18next';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  useBusinessDetails,
  useBusinessHours,
} from '@/features/business/hooks';
import { useServices, useStaff } from '@/features/catalog/hooks';

import { formatPhone } from '@/lib/format';

import { formatMinutes } from './format';
import { useBookingRules } from './hooks';
import type { SettingsItem } from './navigation';
import { openDaysSummary } from './summaries';
import { useWhatsAppChannel } from './useWhatsAppChannel';
import { channelPill } from './whatsappChannel';

/** What a Settings row shows beside its title; `disabled` rows stay visible and say why. */
export interface RowModel {
  detail?: string;
  tone?: 'secondary' | 'success';
  disabled?: boolean;
  reason?: string;
}

/** The WhatsApp row: the number when live, else the channel state. */
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
 * what a role cannot use is `disabled` with a reason, and a
 * value that is still loading (or owner-only) is simply left off.
 */
export function useSettingsRows(): Record<SettingsItem, RowModel> {
  const { t } = useTranslation();
  const details = useBusinessDetails();
  const hours = useBusinessHours();
  const services = useServices();
  const staff = useStaff();
  const rules = useBookingRules();
  const channel = useWhatsAppChannel();

  return React.useMemo(() => {
    const none: RowModel = {};
    const days = hours.data ? openDaysSummary(hours.data) : undefined;

    const whatsapp: RowModel = channel.data
      ? channelRow(channel.data, t)
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
      whatsapp,
      notifications: none,
      appearance: none,
      haptics: none,
      deleteAccount: none,
    };
  }, [
    t,
    channel.data,
    details.data,
    hours.data,
    services.data,
    staff.data,
    rules.data,
  ]);
}
