import {
  EmptyState,
  Group,
  GroupRow,
  resolveSystemColor,
  SwipeableRow,
  Text,
  TintLink,
  useDepth,
  Reveal,
} from '@booking/ui';
import { Plus, UserMinus, UserPlus, Users } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useCanManage } from '@/features/business/me';

import { canRemoveMember, personSubtitle, type TeamPerson } from '../logic';
import { InviteCard } from './InviteCard';

/**
 * The Team board's list: a summary line, the people in one raised group, the
 * "Invite a team member" action and its card.
 */
export function TeamList({
  people,
  onOpen,
  onAddPerson,
  onRemoveMember,
}: {
  people: TeamPerson[];
  onOpen: (key: string) => void;
  onAddPerson: () => void;
  /** Asks to remove a login from the team (the screen confirms). */
  onRemoveMember: (person: TeamPerson) => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const canManage = useCanManage();
  const [inviting, setInviting] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const bookable = people.filter(
    (p) => p.staff?.is_active && p.staff.accepts_bookings,
  ).length;

  return (
    <>
      <Text className="mx-5 mt-1 text-subtitle text-muted-foreground">
        {t('team.summary', { count: bookable })}
      </Text>
      {people.length === 0 ? (
        <EmptyState icon={Users} title={t('staff.empty')} />
      ) : (
        <Group radius={22} className="mt-2">
          {people.map((person, i) => {
            const subtitle = personSubtitle(person, t);
            return (
              <Reveal key={person.key} scope="team" index={i}>
                <SwipeableRow
                  enabled={canRemoveMember(person)}
                  trailing={[
                    {
                      key: 'remove',
                      label: t('common.remove'),
                      spokenLabel: t('team.remove.action'),
                      role: 'destructive',
                      icon: UserMinus,
                      onPress: () => onRemoveMember(person),
                    },
                  ]}
                >
                  <GroupRow
                    showSeparator={i > 0}
                    avatarName={person.name}
                    avatarRing={resolveSystemColor(
                      person.staff?.color,
                      depth.scheme,
                    )}
                    title={person.name}
                    subtitle={subtitle}
                    accessibilityLabel={t('team.openPerson', {
                      name: person.name,
                      meta: [
                        person.job,
                        t(`team.accessSpoken.${person.access}`),
                      ]
                        .filter(Boolean)
                        .join(', '),
                    })}
                    onPress={() => onOpen(person.key)}
                  />
                </SwipeableRow>
              </Reveal>
            );
          })}
        </Group>
      )}
      {canManage ? (
        <>
          <TintLink
            variant="action"
            icon={Plus}
            label={t('team.invite.action')}
            expanded={inviting}
            onPress={() => {
              setInviting((open) => !open);
              setSent(false);
            }}
            className="ml-5 mt-2"
          />
          {inviting ? (
            <InviteCard
              onSent={() => {
                setInviting(false);
                setSent(true);
              }}
            />
          ) : null}
          {sent ? (
            <Text
              accessibilityLiveRegion="polite"
              className="mx-5 mt-1 text-subtitle text-muted-foreground"
            >
              {t('team.invite.sent')}
            </Text>
          ) : null}
          <TintLink
            icon={UserPlus}
            label={t('team.addPerson')}
            onPress={onAddPerson}
            className="ml-5 mt-1"
          />
        </>
      ) : null}
    </>
  );
}
