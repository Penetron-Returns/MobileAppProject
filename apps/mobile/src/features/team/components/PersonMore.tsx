import {
  ColorSwatches,
  ConfirmDialog,
  DestructiveRow,
  Group,
  GroupBlock,
  SegmentedControl,
  systemColorKey,
  SYSTEM_COLORS,
  Text,
  type SystemColorKey,
} from '@booking/ui';
import type { MemberRole } from '@booking/types';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { OwnerOnlyNote } from '@/features/settings/components/OwnerOnlyNote';
import { useSaveStaff } from '@/features/catalog/hooks';
import { useCanManage } from '@/features/business/me';
import { toast } from '@/lib/toast';

import {
  useRemoveMember,
  useRevokeInvitation,
  useUpdateMemberRole,
} from '../hooks';
import type { TeamPerson } from '../logic';

const ROLES: MemberRole[] = ['staff', 'owner'];

/**
 *  */
export function PersonMore({
  person,
  onRemoved,
}: {
  person: TeamPerson;
  /** Called once the person has left the team or the invite is revoked. */
  onRemoved: () => void;
}) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = React.useState(false);
  const role = useUpdateMemberRole();
  const removeMember = useRemoveMember({
    onSuccess: () => {
      toast.success(t('team.removed', { name: person.name }));
      onRemoved();
    },
  });
  const revoke = useRevokeInvitation({
    onSuccess: () => {
      toast.success(t('team.revoked'));
      onRemoved();
    },
  });
  const saveStaff = useSaveStaff();
  const canManage = useCanManage();

  const { member, invitation, staff } = person;
  const canRemove = member ? !member.is_self : Boolean(invitation);
  if (!member && !staff && !invitation) return null;

  const removeNote = !canRemove
    ? t(member ? 'team.remove.self' : 'team.remove.viaEdit')
    : null;

  return (
    <>
      {member || staff ? (
        <Group radius={26} className="mt-6">
          {member ? (
            <View className="min-h-[60px] flex-row items-center gap-3 px-4 py-2">
              <Text className="flex-1 text-title">{t('team.role.label')}</Text>
              <View
                pointerEvents={canManage ? 'auto' : 'none'}
                style={canManage ? undefined : { opacity: 0.55 }}
                className="w-[170px]"
              >
                <SegmentedControl<MemberRole>
                  variant="choice"
                  label={t('team.role.label')}
                  value={member.role}
                  options={ROLES.map((r) => ({
                    value: r,
                    label: t(`team.role.${r}`),
                  }))}
                  onChange={(next) =>
                    next !== member.role &&
                    role.mutate({ userId: member.user_id, role: next })
                  }
                />
              </View>
            </View>
          ) : null}
          {staff ? (
            <GroupBlock showSeparator={Boolean(member)} className="px-4 py-3.5">
              <Text className="text-title">{t('team.colour.label')}</Text>
              <View
                pointerEvents={canManage ? 'auto' : 'none'}
                style={canManage ? undefined : { opacity: 0.55 }}
                className="mt-3"
              >
                <ColorSwatches
                  value={systemColorKey(staff.color)}
                  labelFor={(key: SystemColorKey) => t(`team.colour.${key}`)}
                  onChange={(key) =>
                    saveStaff.mutate({
                      id: staff.id,
                      body: { color: SYSTEM_COLORS[key].light },
                    })
                  }
                />
              </View>
            </GroupBlock>
          ) : null}
        </Group>
      ) : null}
      <Group radius={26} className="mt-4">
        <DestructiveRow
          label={t(
            member || !invitation ? 'team.remove.action' : 'team.revoke.action',
          )}
          disabled={!canManage || !canRemove}
          onPress={() => {
            if (member) setConfirm(true);
            else if (invitation) revoke.mutate(invitation.id);
          }}
        />
      </Group>
      {removeNote && canManage ? (
        <Text className="mx-5 mt-2 text-meta text-muted-foreground">
          {removeNote}
        </Text>
      ) : null}
      <OwnerOnlyNote />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('team.remove.title', { name: person.name })}
        description={t('team.remove.description', { name: person.name })}
        confirmLabel={t('team.remove.confirm')}
        cancelLabel={t('team.remove.keep')}
        destructive
        onConfirm={() => {
          setConfirm(false);
          if (member) removeMember.mutate(member.user_id);
        }}
      />
    </>
  );
}
