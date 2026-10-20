import {
  ConfirmDialog,
  ErrorState,
  GlassPage,
  ListSkeleton,
  Presenter,
} from '@booking/ui';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { SavedCopyBanner } from '@/components/SavedCopyBanner';
import {
  useDeleteStaff,
  useServices,
  useStaff,
  useStaffServices,
  type StaffRow,
} from '@/features/catalog/hooks';
import { useBusinessHours } from '@/features/business/hooks';
import { isFailed, loadError } from '@/lib/offline';
import { describeError, toast } from '@/lib/toast';

import { useAvailabilityRules, useRemoveMember, useTeam } from '../hooks';
import { buildTeam, type TeamPerson } from '../logic';
import { resolveWorkingWeek } from '../schedule';
import { OwnerOnlyNote } from '@/features/settings/components/OwnerOnlyNote';

import { PersonDetail } from './PersonDetail';
import { StaffForm } from './StaffForm';
import { TeamList } from './TeamList';

/**
 * Team (the Staff board): the business's people with whether each can sign in
 * (member, invited, or calendar-only), the invite card, and a person's page.
 * Staff see it read-only (no invite or edit actions); the API enforces the role.
 */
export function TeamScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const staff = useStaff();
  const team = useTeam();
  const services = useServices();
  const links = useStaffServices();
  const rules = useAvailabilityRules();
  const businessHours = useBusinessHours();
  const [presenting, setPresenting] = React.useState(false);
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<StaffRow | 'new' | null>(null);
  const [deleting, setDeleting] = React.useState<StaffRow | null>(null);
  const [removing, setRemoving] = React.useState<TeamPerson | null>(null);
  // The dialog closes before the request ends, so the name for the toast is kept here.
  const removedName = React.useRef('');
  const removeMember = useRemoveMember({
    onSuccess: () =>
      toast.success(t('team.removed', { name: removedName.current })),
  });
  const remove = useDeleteStaff({
    onSuccess: () => {
      toast.success(t('staff.removed'));
      setSelectedKey(null);
    },
  });

  const people = React.useMemo(
    () => buildTeam(staff.data ?? [], team.data),
    [staff.data, team.data],
  );
  const selected = people.find((p) => p.key === selectedKey) ?? null;
  const staffRow = (id: string) => staff.data?.find((s) => s.id === id) ?? null;
  const serviceIdsFor = (staffId: string) =>
    (links.data ?? [])
      .filter((l) => l.staff_id === staffId)
      .map((l) => l.service_id);

  let body: React.ReactNode;
  if (isFailed(staff)) {
    body = (
      <ErrorState
        variant="banner"
        {...describeError(loadError(staff))}
        onRetry={() => void staff.refetch()}
      />
    );
  } else if (staff.isPending) {
    body = <ListSkeleton rows={4} />;
  } else if (selected) {
    const id = selected.staff?.id;
    body = (
      <PersonDetail
        person={selected}
        {...resolveWorkingWeek(
          (rules.data ?? []).filter((r) => r.staff_id === id),
          businessHours.data ?? [],
        )}
        rules={(rules.data ?? []).filter((r) => r.staff_id === id)}
        businessHours={businessHours.data ?? []}
        onPresentChange={setPresenting}
        serviceCount={id ? serviceIdsFor(id).length : 0}
        onEdit={() => id && setEditing(staffRow(id))}
        onGone={() => setSelectedKey(null)}
      />
    );
  } else {
    body = (
      <>
        {team.isError ? (
          <ErrorState
            variant="banner"
            {...describeError(team.error)}
            onRetry={() => void team.refetch()}
          />
        ) : null}
        <TeamList
          people={people}
          onOpen={setSelectedKey}
          onAddPerson={() => setEditing('new')}
          onRemoveMember={setRemoving}
        />
      </>
    );
  }

  return (
    <Presenter active={editing !== null || presenting}>
      <GlassPage
        title={selected ? firstName(selected.name) : t('team.title')}
        backLabel={selected ? t('team.title') : t('tabs.settings')}
        backFallback="/settings"
        onBack={selected ? () => setSelectedKey(null) : undefined}
        onRefresh={() => queryClient.refetchQueries({ type: 'active' })}
      >
        <SavedCopyBanner query={staff} />
        {body}
        <OwnerOnlyNote />
      </GlassPage>
      {editing ? (
        <StaffForm
          staff={editing === 'new' ? null : editing}
          serviceIds={editing === 'new' ? [] : serviceIdsFor(editing.id)}
          services={(services.data ?? []).filter((s) => s.is_active)}
          onClose={() => setEditing(null)}
          onRequestDelete={(row) => {
            setEditing(null);
            setDeleting(row);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('staff.deleteDialog.title')}
        description={t('staff.deleteDialog.description')}
        confirmLabel={t('staff.deleteDialog.confirm')}
        cancelLabel={t('staff.deleteDialog.keep')}
        destructive
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
          setDeleting(null);
        }}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t('team.remove.title', { name: removing?.name ?? '' })}
        description={t('team.remove.description', {
          name: removing?.name ?? '',
        })}
        confirmLabel={t('team.remove.confirm')}
        cancelLabel={t('team.remove.keep')}
        destructive
        onConfirm={() => {
          if (removing?.member) {
            removedName.current = removing.name;
            removeMember.mutate(removing.member.user_id);
          }
          setRemoving(null);
        }}
      />
    </Presenter>
  );
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
