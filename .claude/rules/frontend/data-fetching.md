---
paths: apps/mobile/src/features/**/*.ts,apps/mobile/src/features/**/*.tsx,apps/mobile/src/lib/**/*.ts
description: Rules for reading via Supabase/TanStack Query, writing via the API, and Realtime
---

# Data Fetching

The app reads through Supabase (RLS scopes to the business) and writes through the backend API. Both run through TanStack Query hooks in each feature.

## Implementation

1. Expose data only through feature hooks (`useAppointments`, `useCreateAppointment` …). Screens and components never import `supabase` or `api` directly.
2. Read with the typed Supabase client (`SupabaseClient<Database>`) and select only the columns you render.
3. Write with `api` from `apps/mobile/src/lib/api.ts`. Generate one `Idempotency-Key` per user action and reuse it on retry. Show `ApiError.code`-specific messages (e.g. `SLOT_UNAVAILABLE` → refresh slots).
4. Keep query keys in one `keys.ts` per feature. After a mutation, invalidate the affected keys; don't patch caches by hand unless it's a deliberate optimistic update.
5. Let Realtime subscriptions (`appointments`, `conversations`, `messages`, `escalations`) invalidate queries. Never write Realtime payloads straight into state.
6. Use the generated `Database` types and `packages/types/api.ts` DTOs. Never redeclare row shapes locally.
7. Use the `expo-data-fetching` and `supabase` skills for patterns.

## Examples

```tsx
// ✅ DO
export function useCancelAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: CancelInput) =>
      api.post(`/v1/appointments/${id}/cancel`, body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: appointmentKeys.all }),
  });
}

// ❌ DON'T: a write straight to a table (RLS blocks it anyway)
await supabase
  .from('appointments')
  .update({ status: 'cancelled' })
  .eq('id', id);
```
