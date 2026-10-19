import type { CompanionSetupDTO } from '@booking/types';
import {
  Capsule,
  ErrorState,
  Group,
  GroupRow,
  ListSkeleton,
  SectionTitle,
  Text,
} from '@booking/ui';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, View } from 'react-native';

import { formatPhone } from '@/lib/format';
import { describeError } from '@/lib/toast';

import {
  agoLabel,
  hasHealth,
  isKnown,
  META_BILLING_URL,
  nameTone,
  numberTone,
  paymentState,
  QUALITY_ICON,
  type QualityRating,
  qualityTone,
  sendFailureWords,
  templateSummary,
  templateTone,
} from '../whatsappHealth';

type Whatsapp = CompanionSetupDTO['whatsapp'];
type TFn = ReturnType<typeof useTranslation>['t'];

const QUALITY_COLOR: Record<string, string> = {
  green: '#34C759',
  yellow: '#FF9500',
  red: '#FF3B30',
};
const QUALITY_ICONS = {
  check: CheckCircle2,
  alert: AlertTriangle,
  x: XCircle,
} as const;

const H = 'settings.whatsapp.health';

/** Rows for the number, its message quality and its message limit. */
function numberRows(w: Whatsapp, t: TFn, rows: React.ReactNode[]) {
  const status = w.phone_number_status;
  const quality = w.quality_rating;
  const tier = w.messaging_limit_tier;
  const phone = formatPhone(w.display_phone_number);
  if (isKnown(status)) {
    const label = t(`${H}.number.${status}`);
    rows.push(
      <GroupRow
        key="number"
        showSeparator={rows.length > 0}
        title={t(`${H}.number.title`)}
        subtitle={phone || undefined}
        trailing={<Capsule label={label} tone={numberTone(status)} />}
        accessibilityLabel={`${t(`${H}.number.title`)}, ${phone ? `${phone}, ` : ''}${label}`}
      />,
    );
  }
  if (isKnown(quality)) {
    // Never colour alone: a distinct icon and a word accompany the colour.
    const Icon = QUALITY_ICONS[QUALITY_ICON[quality as QualityRating]];
    const word = t(`${H}.quality.${quality}`);
    const meaning = t(`${H}.quality.${quality}Meaning`);
    rows.push(
      <GroupRow
        key="quality"
        showSeparator={rows.length > 0}
        title={t(`${H}.quality.title`)}
        subtitle={meaning}
        trailing={
          <View className="flex-row items-center gap-2">
            <View testID="quality-icon" accessibilityElementsHidden>
              <Icon size={16} color={QUALITY_COLOR[quality]} />
            </View>
            <Capsule label={word} tone={qualityTone(quality)} />
          </View>
        }
        accessibilityLabel={`${t(`${H}.quality.title`)}, ${word}. ${meaning}`}
      />,
    );
  }
  if (isKnown(tier)) {
    rows.push(
      <GroupRow
        key="limit"
        showSeparator={rows.length > 0}
        title={t(`${H}.limit.title`)}
        subtitle={t(`${H}.limit.${tier}`)}
      />,
    );
  }
}

/** Rows for the display name and the Meta billing payment method (with the "how to add one" help row). */
function accountRows(w: Whatsapp, t: TFn, rows: React.ReactNode[]) {
  const nameStatus = w.name_status;
  const nameBadge = isKnown(nameStatus) ? nameTone(nameStatus) : null;
  if (w.verified_name || nameBadge) {
    rows.push(
      <GroupRow
        key="name"
        showSeparator={rows.length > 0}
        title={t(`${H}.name.title`)}
        subtitle={w.verified_name ?? undefined}
        trailing={
          nameBadge && nameStatus ? (
            <Capsule label={t(`${H}.name.${nameStatus}`)} tone={nameBadge} />
          ) : undefined
        }
      />,
    );
  }
  const payment = paymentState(w);
  if (payment === 'unknown') return;
  const currency = w.billing?.currency;
  const label =
    payment === 'missing'
      ? t(`${H}.payment.missing`)
      : currency
        ? t(`${H}.payment.attachedWithCurrency`, { currency })
        : t(`${H}.payment.attached`);
  rows.push(
    <GroupRow
      key="payment"
      showSeparator={rows.length > 0}
      title={t(`${H}.payment.title`)}
      subtitle={
        payment === 'missing' ? t(`${H}.payment.missingMeaning`) : undefined
      }
      trailing={
        <Capsule
          label={label}
          tone={payment === 'missing' ? 'amber' : 'green'}
        />
      }
      accessibilityLabel={`${t(`${H}.payment.title`)}, ${label}`}
    />,
  );
  if (payment === 'missing') {
    rows.push(
      <GroupRow
        key="payment-howto"
        showSeparator
        title={t(`${H}.payment.howTo`)}
        subtitle={t(`${H}.payment.howToHint`)}
        onPress={() => void Linking.openURL(META_BILLING_URL)}
        accessibilityLabel={`${t(`${H}.payment.howTo`)}. ${t(`${H}.payment.howToHint`)}`}
      />,
    );
  }
}

/** Rows for recent send failures (plain words per Meta code) and the last problem Meta reported. */
function problemRows(w: Whatsapp, t: TFn, now: Date, rows: React.ReactNode[]) {
  const failures = w.recent_send_failures ?? [];
  if (failures.length > 0) {
    rows.push(
      <GroupRow
        key="failures-title"
        showSeparator={rows.length > 0}
        title={t(`${H}.failures.title`)}
      />,
    );
    failures.forEach((failure, index) => {
      const words = sendFailureWords(failure);
      const title = t(words.key, words.values);
      const when = failure.last_at ? agoLabel(t, failure.last_at, now) : null;
      const detail = when
        ? t(`${H}.failures.countLatest`, { count: failure.count, when })
        : t(`${H}.failures.count`, { count: failure.count });
      rows.push(
        <GroupRow
          key={`failure-${failure.code ?? failure.title ?? index}`}
          showSeparator
          title={title}
          subtitle={detail}
          accessibilityLabel={`${title}. ${detail}`}
        />,
      );
    });
  }
  const error = w.last_error;
  if (error) {
    const when = error.at ? agoLabel(t, error.at, now) : null;
    rows.push(
      <GroupRow
        key="problem"
        showSeparator={rows.length > 0}
        title={t(`${H}.problem.title`)}
        subtitle={when ? `${error.message} · ${when}` : error.message}
        trailing={<Capsule label={t(`${H}.problem.title`)} tone="amber" />}
      />,
    );
  }
}

/** The collapsible message-templates rows. */
function TemplateRows({
  templates,
  t,
  first,
}: {
  templates: NonNullable<Whatsapp['templates']>;
  t: TFn;
  first: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const summary = templateSummary(t, templates);
  return (
    <>
      <GroupRow
        showSeparator={!first}
        title={t(`${H}.templates.title`)}
        subtitle={summary}
        onPress={() => setOpen((v) => !v)}
        accessibilityLabel={`${t(`${H}.templates.title`)}, ${summary}. ${t(`${H}.templates.${open ? 'close' : 'open'}`)}`}
      />
      {open
        ? templates.map((tpl) => (
            <GroupRow
              key={`tpl-${tpl.name}`}
              showSeparator
              title={tpl.name}
              subtitle={tpl.rejected_reason ?? undefined}
              trailing={
                <Capsule
                  label={t(`${H}.templates.status.${tpl.status}`)}
                  tone={templateTone(tpl.status)}
                />
              }
            />
          ))
        : null}
    </>
  );
}

/**
 * Settings > WhatsApp > Health: the connected number and its status, message quality and limit, display name,
 * payment method, templates, recent send problems and the last problem Meta reported. Read-only; each row
 * appears only when Nerova sent that field. With no fields the section is absent, except while the live read is
 * loading (skeleton), failed (retry banner) or answered with nothing (a quiet note). `now` is injectable.
 */
export function WhatsAppHealthSection({
  whatsapp,
  now = new Date(),
  load = 'idle',
  error,
  onRetry,
}: {
  whatsapp: Whatsapp;
  now?: Date;
  /** State of the live health read; `idle` (default) shows only what `whatsapp` already carries */
  load?: 'idle' | 'loading' | 'error' | 'loaded';
  error?: unknown;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  if (!hasHealth(whatsapp)) {
    if (load === 'idle' || !whatsapp.connected) return null;
    return (
      <>
        <SectionTitle>{t(`${H}.title`)}</SectionTitle>
        {load === 'loading' ? (
          <ListSkeleton rows={2} />
        ) : load === 'error' ? (
          <ErrorState
            variant="banner"
            {...describeError(error)}
            onRetry={onRetry}
          />
        ) : (
          <Group radius={26}>
            <GroupRow title={t(`${H}.empty`)} subtitle={t(`${H}.emptyHint`)} />
          </Group>
        )}
      </>
    );
  }

  const rows: React.ReactNode[] = [];
  numberRows(whatsapp, t, rows);
  accountRows(whatsapp, t, rows);
  const templates = whatsapp.templates ?? [];
  if (templates.length > 0) {
    rows.push(
      <TemplateRows
        key="templates"
        templates={templates}
        t={t}
        first={rows.length === 0}
      />,
    );
  }
  problemRows(whatsapp, t, now, rows);

  const checked = whatsapp.last_health_check_at
    ? agoLabel(t, whatsapp.last_health_check_at, now)
    : null;
  return (
    <>
      <SectionTitle>{t(`${H}.title`)}</SectionTitle>
      {rows.length > 0 ? <Group radius={26}>{rows}</Group> : null}
      {whatsapp.last_error ? (
        <Text className="mx-5 mt-3 text-meta text-muted-foreground">
          {t(`${H}.problem.hint`)}
        </Text>
      ) : null}
      {checked ? (
        <Text className="mx-5 mt-3 text-meta text-muted-foreground">
          {t(`${H}.checked`, { when: checked })}
        </Text>
      ) : null}
    </>
  );
}
