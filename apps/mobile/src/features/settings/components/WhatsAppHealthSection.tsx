import type { CompanionSetupDTO } from '@booking/types';
import { Capsule, Group, GroupRow, SectionTitle, Text } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import {
  agoLabel,
  hasHealth,
  isKnown,
  nameTone,
  numberTone,
  qualityTone,
  templateSummary,
  templateTone,
} from '../whatsappHealth';

const DOT: Record<string, string> = {
  green: '#34C759',
  yellow: '#FF9500',
  red: '#FF3B30',
};

const H = 'settings.whatsapp.health';

/**
 * Settings > WhatsApp > Health: the number's status, message quality and limit, display name, templates and
 * the last problem Meta reported. Read-only; each row appears only when Nerova sent that field, and the whole
 * section is absent when it sent none. `now` is injectable for the relative times.
 */
export function WhatsAppHealthSection({
  whatsapp,
  now = new Date(),
}: {
  whatsapp: CompanionSetupDTO['whatsapp'];
  now?: Date;
}) {
  const { t } = useTranslation();
  const [showTemplates, setShowTemplates] = React.useState(false);
  if (!hasHealth(whatsapp)) return null;

  const rows: React.ReactNode[] = [];
  const status = whatsapp.phone_number_status;
  const quality = whatsapp.quality_rating;
  const tier = whatsapp.messaging_limit_tier;
  const nameStatus = whatsapp.name_status;
  const nameBadge = isKnown(nameStatus) ? nameTone(nameStatus) : null;
  const templates = whatsapp.templates ?? [];
  const error = whatsapp.last_error;

  if (isKnown(status)) {
    rows.push(
      <GroupRow
        key="number"
        showSeparator={rows.length > 0}
        title={t(`${H}.number.title`)}
        trailing={
          <Capsule
            label={t(`${H}.number.${status}`)}
            tone={numberTone(status)}
          />
        }
        accessibilityLabel={`${t(`${H}.number.title`)}, ${t(`${H}.number.${status}`)}`}
      />,
    );
  }
  if (isKnown(quality)) {
    rows.push(
      <GroupRow
        key="quality"
        showSeparator={rows.length > 0}
        title={t(`${H}.quality.title`)}
        subtitle={t(`${H}.quality.${quality}Meaning`)}
        trailing={
          <View className="flex-row items-center gap-2">
            <View
              testID="quality-dot"
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: DOT[quality],
              }}
            />
            <Capsule
              label={t(`${H}.quality.${quality}`)}
              tone={qualityTone(quality)}
            />
          </View>
        }
        accessibilityLabel={`${t(`${H}.quality.title`)}, ${t(`${H}.quality.${quality}`)}. ${t(`${H}.quality.${quality}Meaning`)}`}
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
  if (whatsapp.verified_name || nameBadge) {
    rows.push(
      <GroupRow
        key="name"
        showSeparator={rows.length > 0}
        title={t(`${H}.name.title`)}
        subtitle={whatsapp.verified_name ?? undefined}
        trailing={
          nameBadge && nameStatus ? (
            <Capsule label={t(`${H}.name.${nameStatus}`)} tone={nameBadge} />
          ) : undefined
        }
      />,
    );
  }
  if (templates.length > 0) {
    const summary = templateSummary(t, templates);
    rows.push(
      <GroupRow
        key="templates"
        showSeparator={rows.length > 0}
        title={t(`${H}.templates.title`)}
        subtitle={summary}
        onPress={() => setShowTemplates((open) => !open)}
        accessibilityLabel={`${t(`${H}.templates.title`)}, ${summary}. ${t(`${H}.templates.${showTemplates ? 'close' : 'open'}`)}`}
      />,
    );
    if (showTemplates) {
      for (const tpl of templates) {
        rows.push(
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
          />,
        );
      }
    }
  }
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

  const checked = whatsapp.last_health_check_at
    ? agoLabel(t, whatsapp.last_health_check_at, now)
    : null;
  return (
    <>
      <SectionTitle>{t(`${H}.title`)}</SectionTitle>
      {rows.length > 0 ? <Group radius={26}>{rows}</Group> : null}
      {error ? (
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
