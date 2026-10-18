import { useAuth, useOrganization, useOrganizationList } from '@clerk/expo';
import type { MeDTO, OnboardingRequest } from '@booking/types';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { api } from '@/lib/api';
import i18n from '@/lib/i18n';
import { qk, useApiMutation } from '@/lib/query';

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
  const { createOrganization, setActive } = useOrganizationList();
  const orgIdRef = React.useRef<string | null>(null);
  orgIdRef.current ??= organization?.id ?? null;

  return useApiMutation<OnboardingRequest, MeDTO>({
    mutationFn: async (request, key) => {
      if (!orgIdRef.current) {
        const created = await createOrganization?.({
          name: request.business.name,
        });
        if (!created) throw new Error(i18n.t('onboarding.orgFailed'));
        orgIdRef.current = created.id;
      }
      if (organization?.id !== orgIdRef.current) {
        await setActive?.({ organization: orgIdRef.current });
      }
      // The session token must carry the new org before the API sees it.
      await getToken({ skipCache: true });
      return api.onboard(request, key);
    },
    // The inline error card replaces the default toast.
    onError: () => true,
    onSuccess: (me) => {
      qc.setQueryData(qk.me, me);
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
