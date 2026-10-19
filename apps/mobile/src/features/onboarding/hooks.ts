import {
  useAuth,
  useOrganization,
  useOrganizationList,
  useUser,
} from '@clerk/expo';
import type { MeDTO, OnboardingRequest } from '@booking/types';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { api } from '@/lib/api';
import i18n from '@/lib/i18n';
import { qk, useApiMutation } from '@/lib/query';

import { ensureOrganization } from './organization';

/**
 * Creates the business: first the Clerk organisation (client-side, skipped when
 * the user already has one active, e.g. after a failed first attempt), then the
 * backend call that mirrors it into a business with hours, services and team.
 * Retrying reuses the same Idempotency-Key and never creates a second org.
 */
export function useCompleteOnboarding() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  const { organization } = useOrganization();
  const { user } = useUser();
  const { createOrganization, setActive } = useOrganizationList();
  const orgIdRef = React.useRef<string | null>(null);
  orgIdRef.current ??= organization?.id ?? null;

  return useApiMutation<OnboardingRequest, MeDTO>({
    mutationFn: async (request, key) => {
      orgIdRef.current ??= await ensureOrganization({
        userId: user?.id ?? null,
        activeOrgId: null,
        listOwnedOrgIds: async () =>
          (await user?.getOrganizationMemberships())?.data
            .filter((m) => m.role === 'org:admin')
            .map((m) => m.organization.id) ?? [],
        create: async () => {
          const created = await createOrganization?.({
            name: request.business.name,
          });
          if (!created) throw new Error(i18n.t('onboarding.orgFailed'));
          return created.id;
        },
      });
      if (organization?.id !== orgIdRef.current) {
        await setActive?.({ organization: orgIdRef.current });
      }
      // The session token must carry the new org before the API sees it.
      await getToken({ skipCache: true });
      return api.onboard(request, key);
    },
    // The inline error card replaces the default toast.
    onError: () => true,
    onSuccess: (me, request) => {
      qc.setQueryData(qk.me, me);
      // The route gate reads the hours to know onboarding finished: never let a stale empty list send the owner back.
      qc.setQueryData(qk.businessHours, request.hours);
      // The plan screen is next: warm its query so it opens without skeletons.
      void qc.prefetchQuery({ queryKey: qk.plans, queryFn: api.plans });
    },
  });
}

/**
 * Back from the plan screen: re-runs onboarding for the business that already
 * exists. The API applies the new name and type template only while the business
 * is untouched, and never creates a second business.
 */
export function useReviseBusiness() {
  const qc = useQueryClient();
  return useApiMutation<OnboardingRequest, MeDTO>({
    mutationFn: (request, key) => api.onboard(request, key),
    onError: () => true,
    onSuccess: (me) => {
      qc.setQueryData(qk.me, me);
    },
  });
}
