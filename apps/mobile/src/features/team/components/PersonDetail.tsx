import {
  Avatar,
  Group,
  GroupRow,
  resolveSystemColor,
  Text,
  TintLink,
  useDepth,
} from '@booking/ui';
import { router } from 'expo-router';
import { Mail, Pencil } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { BusinessHoursRule, WorkingDay } from '../schedule';
import type { TeamPerson } from '../logic';
import { InviteCard } from './InviteCard';
import { PersonMore } from './PersonMore';
import { PersonSchedule } from './PersonSchedule';

/**
 * A person's page per the Team board: ringed portrait, name and job, a card
 * with Working days and Services, then More (role, colour, remove). People with
 * no app access get the invite card here, linked to their calendar row.
 */
export function PersonDetail({
  person,
  week,
  inherited,
  rules,
  businessHours,
  serviceCount,
  onEdit,
  onGone,
  onPresentChange,
}: {
  person: TeamPerson;
  /** Weekly hours of the person (Monday first); empty when not loaded or none set. */
  week: WorkingDay[];
  /** True when the week is the business hours (the person has no hours of their own). */
  inherited: boolean;
  /** The person's own weekly rules (empty = follows the business). */
  rules: { weekday: number; start_time: string; end_time: string }[];
  businessHours: BusinessHoursRule[];
  serviceCount: number;
  onEdit: () => void;
  /** The person left the team (or the invite was revoked): back to the list. */
  onGone: () => void;
  /** True while a schedule editor sheet is open, so the page can shrink behind it. */
  onPresentChange: (active: boolean) => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const [inviting, setInviting] = React.useState(false);
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const { staff } = person;

  return (
    <>
      <View className="items-center px-5 pt-1">
        <Avatar
          name={person.name}
          size="hero"
          ring={resolveSystemColor(staff?.color, depth.scheme)}
        />
        <Text
          role="heading"
          aria-level="2"
          className="mt-2.5 text-center text-section font-bold"
        >
          {person.name}
        </Text>
        {person.job ? (
          <Text className="text-center text-subtitle text-muted-foreground">
            {person.job}
          </Text>
        ) : null}
      </View>

      {staff ? (
        <Group radius={26} className="mt-6">
          <PersonSchedule
            staffId={staff.id}
            week={week}
            inherited={inherited}
            rules={rules}
            businessHours={businessHours}
            onPresentChange={onPresentChange}
          />
          <GroupRow
            showSeparator
            title={t('team.services.title')}
            subtitle={t('team.services.count', { count: serviceCount })}
            onPress={() => router.push('/settings/services' as never)}
          />
        </Group>
      ) : null}

      {staff ? (
        <TintLink
          icon={Pencil}
          label={t('team.editDetails')}
          onPress={onEdit}
          className="ml-5 mt-1"
        />
      ) : null}

      {person.access === 'none' && staff ? (
        <>
          <TintLink
            variant="action"
            icon={Mail}
            label={t('team.invite.toApp')}
            expanded={inviting}
            onPress={() => {
              setInviting((open) => !open);
              setSentTo(null);
            }}
            className="ml-5 mt-1"
          />
          {inviting ? (
            <InviteCard
              staffId={staff.id}
              defaultEmail={staff.email}
              onSent={(email) => {
                setInviting(false);
                setSentTo(email);
              }}
            />
          ) : null}
          {sentTo ? (
            <Text
              accessibilityLiveRegion="polite"
              className="mx-5 mt-1 text-subtitle text-muted-foreground"
            >
              {t('team.invite.sent')}
            </Text>
          ) : null}
        </>
      ) : null}

      {person.access === 'invited' && person.invitation ? (
        <Text className="mx-5 mt-3 text-subtitle text-muted-foreground">
          {t('team.invite.pendingFor', {
            email: person.invitation.email,
            role: t(`team.role.${person.invitation.role}`),
          })}
        </Text>
      ) : null}

      <PersonMore person={person} onRemoved={onGone} />
    </>
  );
}
